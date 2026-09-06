'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ENTITY_ORDER, type EntityKey } from '@/src/shared/firestore/dataEntities';
import { buildTemplateWorkbook, downloadWorkbook } from '@/src/shared/firestore/dataWorkbook';

export function useLogic() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<EntityKey>>(new Set(ENTITY_ORDER));
  const [done, setDone] = useState(false);

  function handleDownload() {
    if (selected.size === 0) return;
    const workbook = buildTemplateWorkbook([...selected]);
    downloadWorkbook(workbook, 'dreda-import-template.xlsx');
    setDone(true);
  }

  function goBack() {
    router.push('/settings');
  }

  return { selected, setSelected, done, handleDownload, goBack };
}
