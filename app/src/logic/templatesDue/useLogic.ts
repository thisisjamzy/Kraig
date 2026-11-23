'use client';

// Repeating templates due today (owner, 23 Nov 2026): shown in Payments
// with Record (the filled-in form) and Skip (records nothing), and fed to
// the "Due today" notification for those with a reminder on.

import { useMemo, useState } from 'react';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionTemplatesRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { skipTemplate } from '@/src/shared/firestore/templateWrites';
import { dayKey, isDueOn, repeatText } from '@/src/viewmodels/templates';
import type { FirestoreTransactionTemplate } from '@/src/shared/firestore/types';

export function useDueTemplates(day: Date = new Date()) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: templates, loading } = useFirestoreCollection<FirestoreTransactionTemplate>(useMemo(() => (uid ? query(transactionTemplatesRef(uid)) : null), [uid]));
  const key = dayKey(day);
  const due = useMemo(
    () =>
      templates
        .filter((t) => isDueOn(t, new Date(`${key}T12:00:00`)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ template: t, repeat: repeatText(t), recordHref: `/add-transaction?templateId=${encodeURIComponent(t.id)}` })),
    [templates, key]
  );
  const [busy, setBusy] = useState<string | null>(null);
  async function skip(id: string) {
    if (!uid || busy) return;
    setBusy(id);
    try {
      await skipTemplate(uid, id, key);
    } finally {
      setBusy(null);
    }
  }
  return { due, skip, busy, loading };
}
