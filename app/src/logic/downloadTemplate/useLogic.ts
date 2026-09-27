'use client';

import { useState } from 'react';
import { ENTITY_ORDER, type EntityKey } from '@/src/shared/firestore/dataEntities';
import { buildTemplateWorkbook, downloadWorkbook } from '@/src/shared/firestore/dataWorkbook';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic() {
  const [selected, setSelected] = useState<Set<EntityKey>>(new Set(ENTITY_ORDER));
  const [done, setDone] = useState(false);

  function handleDownload() {
    if (selected.size === 0) return;
    const workbook = buildTemplateWorkbook([...selected]);
    downloadWorkbook(workbook, 'dreda-import-template.xlsx');
    setDone(true);
  }

  // Back to the page the user came from (skipping forms); '/settings' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings');
  }

  return { selected, setSelected, done, handleDownload, goBack };
}
