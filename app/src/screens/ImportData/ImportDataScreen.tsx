'use client';

// Settings > Import and export > Import (/settings/import): projects and
// tasks from a spreadsheet (ImportProjectsForm), opened from a project as
// "Import tasks" with ?project=<id>, or at an earlier import's report with
// ?report=<id>. ?mode=restore is the full Dreda backup restore.

import { useState } from 'react';
import { ImportProjectsForm } from '@/src/forms/ImportProjectsForm/ImportProjectsForm';
import { peekAwareParams } from '@/src/shared/navigation/formPeek';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';
import { FullRestore } from './FullRestore';

function readParams() {
  if (typeof window === 'undefined') return { mode: null, project: null, report: null };
  const sp = peekAwareParams(window.location.search);
  return { mode: sp.get('mode'), project: sp.get('project'), report: sp.get('report') };
}

export function ImportDataScreen() {
  const [{ mode, project, report }] = useState(readParams);
  const finish = useFormFinish();
  if (mode === 'restore') return <FullRestore />;
  return (
    <ImportProjectsForm
      projectId={project}
      reportId={report}
      onClose={() => finish(project ? `/projects/${project}` : '/settings')}
      restoreHref={project ? undefined : '/settings/import?mode=restore'}
    />
  );
}
