'use client';

// Import tasks (/settings/import): one task list, one template
// (ImportTasksForm). Opened from Tasks, Projects, an area (?area=<id>) or a
// project (?project=<id>), or at an earlier import's report with
// ?report=<id>. ?mode=restore is the full Dreda backup restore.

import { useState } from 'react';
import { ImportTasksForm } from '@/src/forms/ImportTasksForm/ImportTasksForm';
import { peekAwareParams } from '@/src/shared/navigation/formPeek';
import { useFormFinish } from '@/src/shared/navigation/formPeekContext';
import { FullRestore } from './FullRestore';

function readParams() {
  if (typeof window === 'undefined') return { mode: null, area: null, project: null, report: null };
  const sp = peekAwareParams(window.location.search);
  return { mode: sp.get('mode'), area: sp.get('area'), project: sp.get('project'), report: sp.get('report') };
}

export function ImportDataScreen() {
  const [{ mode, area, project, report }] = useState(readParams);
  const finish = useFormFinish();
  if (mode === 'restore') return <FullRestore />;
  return (
    <ImportTasksForm
      areaId={area}
      projectId={project}
      reportId={report}
      onClose={() => finish(project ? `/projects/${project}` : area ? `/areas/${area}` : '/tasks')}
      restoreHref={project || area ? undefined : '/settings/import?mode=restore'}
    />
  );
}
