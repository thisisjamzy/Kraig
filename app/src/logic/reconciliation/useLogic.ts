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
  clearUnaccountedBalance,
  balancesAsOf,
} from '@/src/shared/firestore/unaccountedBalance';
import { toDisplay } from '@/src/shared/firestore/currency';
import { dayValue, endsNow, windowFor, WINDOW_PRESETS, type WindowPreset } from '@/src/shared/budget/walletWindow';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreAccount, FirestoreTransaction } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

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
      .catch(() => {
        if (!cancelled) setExplained([]);
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

  // The window the check is for (src/shared/budget/walletWindow.ts): the
  // real balances are the ones at its end, and each wallet's ledger figure
  // is its balance on that date. "This month" ends now: today's balances.
  const [preset, setPreset] = useState<WindowPreset>('thisMonth');
  const [customFrom, setCustomFrom] = useState(() => dayValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => dayValue(new Date()));
  const window = useMemo(() => windowFor(preset, new Date(), { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const isNow = endsNow(window, new Date());
  const toMs = window.to.getTime();
  const [asOf, setAsOf] = useState<{ at: number; balances: Record<string, number> } | null>(null);
  const [asOfError, setAsOfError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid || isNow) return;
    let cancelled = false;
    balancesAsOf(uid, new Date(toMs))
      .then((balances) => {
        if (!cancelled) setAsOf({ at: toMs, balances });
      })
      .catch((err) => {
        if (!cancelled) setAsOfError(err instanceof Error ? err.message : 'Could not work out the balances on that date.');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, isNow, toMs]);
  const asOfLoading = !isNow && asOf?.at !== toMs && !asOfError;
  const ledgerOf = (account: FirestoreAccount) => (isNow ? account.currentBalance : (asOf?.at === toMs ? asOf.balances[account.id] : undefined) ?? account.currentBalance);

  function seed() {
    const next: Record<string, string> = {};
    for (const account of accounts) next[account.id] = String(round2(ledgerOf(account)));
    return next;
  }

  function openReconcile() {
    setReportedByAccountId(seed());
    setSaveError(null);
    setJustSaved(false);
    setReconcileOpen(true);
  }

  // A new window starts every wallet again from its ledger figure there.
  const seedKey = `${isNow ? 'now' : toMs}:${asOfLoading ? 'loading' : 'ready'}:${accounts.length}`;
  const [seededFor, setSeededFor] = useState(seedKey);
  if (reconcileOpen && seededFor !== seedKey && !asOfLoading) {
    setSeededFor(seedKey);
    setReportedByAccountId(seed());
  }

  function setReportedValue(accountId: string, value: string) {
    setReportedByAccountId((current) => ({ ...current, [accountId]: value.replace(/[^0-9.-]/g, '') }));
  }

  const totalLedger = accounts.reduce((sum, a) => sum + ledgerOf(a), 0);
  const totalReported = accounts.reduce((sum, a) => sum + (Number(reportedByAccountId[a.id]) || 0), 0);
  const liveGap = round2(totalLedger - totalReported);

  async function handleSaveReconciliation() {
    if (!uid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const reportedBalances: Record<string, number> = {};
      for (const account of accounts) reportedBalances[account.id] = Number(reportedByAccountId[account.id]) || 0;
      await performReconciliation(uid, reportedBalances, { window });
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

  // Clearing the unaccounted balance: writes it off, nothing moves into or
  // out of a real wallet (clearUnaccountedBalance). Asks first, inline.
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearedAmount, setClearedAmount] = useState<number | null>(null);
  const lastClear = useMemo(() => {
    const clears = unjustifiedWallet?.unaccountedClears ?? [];
    const last = clears[clears.length - 1];
    return last ? { at: last.at.toDate(), amount: toDisplay(ctx, last.amount, unjustifiedWallet?.currency ?? ctx.base) } : null;
  }, [unjustifiedWallet, ctx]);

  async function handleClearUnaccounted() {
    if (!uid || clearing) return;
    setClearing(true);
    setClearError(null);
    try {
      const amount = await clearUnaccountedBalance(uid);
      setClearedAmount(toDisplay(ctx, amount, unjustifiedWallet?.currency ?? ctx.base));
      setJustSaved(false);
      setClearOpen(false);
    } catch (err) {
      setClearError(err instanceof Error ? err.message : 'Could not clear the unaccounted balance.');
    } finally {
      setClearing(false);
    }
  }

  function openHistory() {
    router.push('/settings/reconciliation/history');
  }

  // Back to the page the user came from (skipping forms); '/settings' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings');
  }

  return {
    currency: ctx.display,
    unaccountedBalance,
    accounts,
    explained,
    explainedLoading,

    reconcileOpen,
    openReconcile,
    windowPresets: WINDOW_PRESETS,
    preset,
    setPreset: (p: WindowPreset) => {
      setAsOfError(null);
      setPreset(p);
    },
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    window,
    isNow,
    asOfLoading,
    asOfError,
    ledgerOf,
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

    clearOpen,
    openClear: () => {
      setClearError(null);
      setClearedAmount(null);
      setClearOpen(true);
    },
    closeClear: () => setClearOpen(false),
    clearing,
    clearError,
    clearedAmount,
    lastClear,
    handleClearUnaccounted,

    openHistory,
    goBack,
    loading: accountsLoading || unjustifiedLoading,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
