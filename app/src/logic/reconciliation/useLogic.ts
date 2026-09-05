'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { unjustifiedWalletRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import {
  ensureUnjustifiedWallet,
  performReconciliation,
  listExplainedTransactions,
} from '@/src/shared/firestore/unaccountedBalance';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount, FirestoreTransaction } from '@/src/shared/firestore/types';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();

  const unjustifiedRef = useMemo(() => (uid ? unjustifiedWalletRef(uid) : null), [uid]);
  const { data: unjustifiedWallet, loading: unjustifiedLoading } = useFirestoreDoc<FirestoreAccount>(unjustifiedRef);
  const { data: accounts, loading: accountsLoading } = useAccounts();

  // Lazily backfills the Unjustified wallet for an account that predates
  // this feature — ensureUserDoc.ts already does this on every login, but
  // this is a harmless, idempotent belt-and-suspenders check for the one
  // screen that actually depends on the wallet existing.
  useEffect(() => {
    if (!uid || unjustifiedLoading || unjustifiedWallet) return;
    ensureUnjustifiedWallet(uid, ctx.base);
  }, [uid, unjustifiedLoading, unjustifiedWallet, ctx.base]);

  const unaccountedBalance = toDisplay(ctx, unjustifiedWallet?.currentBalance ?? 0, unjustifiedWallet?.currency ?? ctx.base);

  const [explained, setExplained] = useState<FirestoreTransaction[] | null>(null);
  const [explainedLoading, setExplainedLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setExplainedLoading(true);
    listExplainedTransactions(uid, 10)
      .then((rows) => {
        if (!cancelled) setExplained(rows);
      })
      .finally(() => {
        if (!cancelled) setExplainedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Reconcile Now — an inline expandable form rather than its own screen
  // (PRD-AUDIT-RECONCILIATION.md section 7 leaves nav placement open;
  // folding it into this same screen means one less route for the same
  // capability). `reportedByAccountId` seeds to each account's own current
  // ledger balance so "nothing changed here" is the default, not a blank
  // field the household has to fill in for every account regardless.
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reportedByAccountId, setReportedByAccountId] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function openReconcile() {
    const seed: Record<string, string> = {};
    for (const account of accounts) seed[account.id] = String(round2(account.currentBalance));
    setReportedByAccountId(seed);
    setSaveError(null);
    setJustSaved(false);
    setReconcileOpen(true);
  }

  function setReportedValue(accountId: string, value: string) {
    setReportedByAccountId((current) => ({ ...current, [accountId]: value.replace(/[^0-9.-]/g, '') }));
  }

  const totalLedger = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const totalReported = accounts.reduce((sum, a) => sum + (Number(reportedByAccountId[a.id]) || 0), 0);
  const liveGap = round2(totalLedger - totalReported);

  async function handleSaveReconciliation() {
    if (!uid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const reportedBalances: Record<string, number> = {};
      for (const account of accounts) reportedBalances[account.id] = Number(reportedByAccountId[account.id]) || 0;
      await performReconciliation(uid, reportedBalances);
      const rows = await listExplainedTransactions(uid, 10);
      setExplained(rows);
      setJustSaved(true);
      setReconcileOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this reconciliation.');
    } finally {
      setSaving(false);
    }
  }

  function openHistory() {
    router.push('/settings/reconciliation/history');
  }

  function goBack() {
    router.push('/settings');
  }

  return {
    currency: ctx.display,
    unaccountedBalance,
    accounts,
    explained,
    explainedLoading,

    reconcileOpen,
    openReconcile,
    closeReconcile: () => setReconcileOpen(false),
    reportedByAccountId,
    setReportedValue,
    totalLedger,
    totalReported,
    liveGap,
    saving,
    saveError,
    justSaved,
    handleSaveReconciliation,

    openHistory,
    goBack,
    loading: accountsLoading || unjustifiedLoading,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
