'use client';

// Settings > Import and export > Import (/settings/import): projects and
// tasks (Time template) or money (Money template) from a spreadsheet
// (ImportProjectsForm), opened from a project as "Import tasks" with
// ?project=<id>, from a basket's "Import items" with ?kind=money, or at an
// earlier import's report with ?report=<id>. ?mode=restore is the full
// Dreda backup restore.

import { useState } from 'react';
import { ImportProjectsForm } from '@/src/forms/ImportProjectsForm/ImportProjectsForm';
import { peekAwareParams } from '@/src/shared/navigation/formPeek';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';
import { FullRestore } from './FullRestore';
import type { TemplateKind } from '@/src/shared/import/templates';

function readParams(): { mode: string | null; project: string | null; report: string | null; kind: TemplateKind | null } {
  if (typeof window === 'undefined') return { mode: null, project: null, report: null, kind: null };
  const sp = peekAwareParams(window.location.search);
  const kind = sp.get('kind');
  return { mode: sp.get('mode'), project: sp.get('project'), report: sp.get('report'), kind: kind === 'money' || kind === 'time' ? (kind as TemplateKind) : null };
}

export function ImportDataScreen() {
  const [{ mode, project, report, kind }] = useState(readParams);
  const finish = useFormFinish();
  if (mode === 'restore') return <FullRestore />;
  return (
    <ImportProjectsForm
      projectId={project}
      kind={kind}
      reportId={report}
      onClose={() => finish(project ? `/projects/${project}` : '/settings')}
      restoreHref={project ? undefined : '/settings/import?mode=restore'}
    />
  );
}
