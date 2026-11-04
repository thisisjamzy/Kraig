'use client';

import { useEffect, useState } from 'react';
import { listReconciliations, previewRevertReconciliation, revertReconciliation } from '@/src/shared/firestore/unaccountedBalance';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreReconciliation } from '@/src/shared/firestore/types';
import type { RevertPlan } from '@/src/shared/budget/revertPlan';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();
  const { data: accounts } = useAccounts();

  const [rows, setRows] = useState<FirestoreReconciliation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Bumped after a revert, to read the history again.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listReconciliations(uid)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
          setError(null);
        }
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
  }, [uid, reloadKey]);

  function accountName(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  }

  function toggleExpanded(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  // Reverting a check (src/shared/budget/revertPlan.ts): the preview is
  // read when the dialog opens, so it shows exactly what will go.
  const [revertId, setRevertId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RevertPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function startRevert(id: string) {
    if (!uid) return;
    setRevertId(id);
    setPlan(null);
    setPlanError(null);
    setNotice(null);
    try {
      setPlan(await previewRevertReconciliation(uid, id));
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not read what this would revert.');
    }
  }

  function cancelRevert() {
    if (reverting) return;
    setRevertId(null);
    setPlan(null);
    setPlanError(null);
  }

  async function confirmRevert() {
    if (!uid || !revertId || reverting) return;
    setReverting(true);
    setPlanError(null);
    try {
      const result = await revertReconciliation(uid, revertId, ctx, (done, total) => setProgress({ done, total }));
      const checks = result.checks === 1 ? '1 reconciliation' : `${result.checks} reconciliations`;
      const entries = result.deleted === 1 ? '1 entry' : `${result.deleted} entries`;
      setNotice(`Reverted ${checks} and deleted ${entries}.`);
      setRevertId(null);
      setPlan(null);
      setExpandedId(null);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not revert this reconciliation.');
    } finally {
      setReverting(false);
      setProgress(null);
      // Whatever got done (all of it, or part way), show the history as it is now.
      setReloadKey((k) => k + 1);
    }
  }

  // Back to the page the user came from (skipping forms); '/settings/reconciliation' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings/reconciliation');
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
    revertId,
    plan,
    planError,
    reverting,
    progress,
    notice,
    startRevert,
    cancelRevert,
    confirmRevert,
  };
}
