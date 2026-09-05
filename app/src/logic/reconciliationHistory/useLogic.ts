'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listReconciliations } from '@/src/shared/firestore/unaccountedBalance';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreReconciliation } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();
  const { data: accounts } = useAccounts();

  const [rows, setRows] = useState<FirestoreReconciliation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listReconciliations(uid)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load reconciliation history.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  function accountName(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  }

  function toggleExpanded(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  function goBack() {
    router.push('/settings/reconciliation');
  }

  return {
    currency: ctx.display,
    rows,
    loading,
    error,
    expandedId,
    toggleExpanded,
    accountName,
    goBack,
  };
}
