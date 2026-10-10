'use client';

// "Check your items": the baskets migration's one-time review list
// (src/shared/firestore/basketsMigration.ts). Every item it gave a kind
// (Payment, Allowance, Set aside) with why; the household can change any
// of them, then "Done" marks the list reviewed.

import { useMemo, useState } from 'react';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { migrationRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { markBasketsMigrationReviewed, reviewEntriesOf, setItemKind } from '@/src/shared/firestore/basketsMigration';
import { BASKETS_MIGRATION_ID } from '@/src/shared/budget/basketsMigration';
import { ITEM_KINDS, ITEM_KIND_LABEL, type ItemKind } from '@/src/shared/budget/itemKinds';
import type { FirestoreMigration } from '@/src/shared/firestore/types';

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const goBack = useGoBack();
  const { data, loading } = useFirestoreDoc<FirestoreMigration>(useMemo(() => (uid ? migrationRef(uid, BASKETS_MIGRATION_ID) : null), [uid]));
  // Transfers were listed by an earlier version; they have no kind now.
  const entries = useMemo(() => reviewEntriesOf(data?.report).filter((e) => e.why !== 'Transfer'), [data]);
  // What the household changed here (the stored list keeps the first guess).
  const [chosen, setChosen] = useState<Record<string, ItemKind>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byBasket = useMemo(() => {
    const out = new Map<string, { bucketId: string; bucketName: string; entries: typeof entries }>();
    for (const entry of entries) {
      const group = out.get(entry.bucketId) ?? { bucketId: entry.bucketId, bucketName: entry.bucketName, entries: [] };
      group.entries.push(entry);
      out.set(entry.bucketId, group);
    }
    return [...out.values()].sort((a, b) => a.bucketName.localeCompare(b.bucketName));
  }, [entries]);

  async function choose(bucketId: string, itemId: string, kind: ItemKind) {
    if (!uid) return;
    const key = `${bucketId}/${itemId}`;
    const before = chosen[key];
    setChosen((c) => ({ ...c, [key]: kind }));
    setError(null);
    try {
      await setItemKind(uid, bucketId, itemId, kind);
    } catch (caught) {
      setChosen((c) => {
        const next = { ...c };
        if (before) next[key] = before;
        else delete next[key];
        return next;
      });
      setError(caught instanceof Error ? caught.message : 'Could not change that item.');
    }
  }

  async function done() {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await markBasketsMigrationReviewed(uid);
      goBack('/budget');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
      setBusy(false);
    }
  }

  return {
    loading,
    byBasket,
    count: entries.length,
    kindOf: (bucketId: string, itemId: string, fallback: ItemKind) => chosen[`${bucketId}/${itemId}`] ?? fallback,
    kindOptions: ITEM_KINDS.map((k) => ({ value: k, label: ITEM_KIND_LABEL[k] })),
    choose,
    done,
    busy,
    error,
    reviewed: Boolean(data?.reviewedAt),
    goBack: () => goBack('/budget'),
  };
}
