'use client';

// One wallet's audit (Wallet > Audit this wallet): for a window of time,
// what came in and what went out, from the opening balance to the closing
// one (src/shared/budget/walletWindow.ts); whether the stored balance
// matches every entry ever recorded on it (reconciliation.ts's audit, for
// this wallet only); and reconciling just this wallet for that window.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyBalanceCorrections, auditWallet, saveBalanceBaselines, type WalletRecords } from '@/src/shared/firestore/reconciliation';
import { performReconciliation } from '@/src/shared/firestore/unaccountedBalance';
import { dayValue, endsNow, reconciliationAdjustments, walletFlows, windowFor, windowStatement, WINDOW_PRESETS, type WindowPreset } from '@/src/shared/budget/walletWindow';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function useLogic(walletId: string) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [records, setRecords] = useState<WalletRecords | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const next = await auditWallet(uid, walletId);
      // Once, for a wallet reconciled before adjustments were kept.
      await saveBalanceBaselines(uid, next.audit);
      setRecords(next);
      setLoadError(null);
      setLoadedAt(Date.now());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not audit this wallet.');
    }
  }, [uid, walletId]);

  useEffect(() => {
    let cancelled = false;
    if (uid) auditWallet(uid, walletId).then(
      async (next) => {
        await saveBalanceBaselines(uid, next.audit);
        if (cancelled) return;
        setRecords(next);
        setLoadedAt(Date.now());
      },
      (err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not audit this wallet.');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uid, walletId]);

  const [preset, setPreset] = useState<WindowPreset>('thisMonth');
  const [customFrom, setCustomFrom] = useState(() => dayValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => dayValue(new Date()));
  // loadedAt: "now" moves on when the audit is run again.
  const span = useMemo(() => windowFor(preset, new Date(), { from: customFrom, to: customTo }), [preset, customFrom, customTo, loadedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const account = records?.account ?? null;
  const row = records?.audit.accounts[0] ?? null;
  const flows = useMemo(() => (records ? walletFlows(walletId, records.transactions, records.transfers) : []), [records, walletId]);
  const adjustments = useMemo(() => (records ? reconciliationAdjustments(records.checks, walletId) : []), [records, walletId]);
  const statement = useMemo(() => (account ? windowStatement(account.currentBalance, flows, adjustments, span) : null), [account, flows, adjustments, span]);

  // What made up money in and money out inside the window.
  const breakdown = useMemo(() => {
    const out = { income: 0, incomeCount: 0, transfersIn: 0, transfersInCount: 0, spent: 0, spentCount: 0, transfersOut: 0, transfersOutCount: 0, charges: 0 };
    if (!records) return out;
    const from = span.from?.getTime() ?? -Infinity;
    const to = span.to.getTime();
    const inside = (d: Date) => d.getTime() >= from && d.getTime() <= to;
    for (const t of records.transactions) {
      if (!inside(t.date) || t.excluded || t.isFrozenSavings) continue;
      const signed = t.signedAmount ?? (t.direction === 'Inflow' ? t.amount : -t.amount);
      if (signed >= 0) {
        out.income += signed;
        out.incomeCount += 1;
      } else {
        out.spent -= signed;
        out.spentCount += 1;
      }
    }
    for (const t of records.transfers) {
      if (!inside(t.date)) continue;
      if (t.toAccountId === walletId) {
        out.transfersIn += t.amount;
        out.transfersInCount += 1;
      }
      if (t.fromAccountId === walletId) {
        out.transfersOut += t.amount;
        out.transfersOutCount += 1;
        out.charges += t.charges ?? 0;
      }
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, r2(v)])) as typeof out;
  }, [records, span, walletId]);

  // ---- Fixing the stored balance ----
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  async function fixBalance() {
    if (!uid || !row || row.difference === 0 || fixing) return;
    setFixing(true);
    setFixError(null);
    try {
      await applyBalanceCorrections(uid, [{ accountId: walletId, expectedBalance: row.expectedBalance }]);
      await load();
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Could not fix the balance.');
    } finally {
      setFixing(false);
    }
  }

  // ---- Reconciling this wallet for the window ----
  const [reported, setReported] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconciledGap, setReconciledGap] = useState<number | null>(null);
  const closing = statement?.closing ?? 0;
  const reportedValue = reported.trim() === '' ? null : Number(reported);
  const gap = reportedValue === null || Number.isNaN(reportedValue) ? null : r2(closing - reportedValue);
  async function reconcile() {
    if (!uid || reportedValue === null || Number.isNaN(reportedValue) || reconciling) return;
    setReconciling(true);
    setReconcileError(null);
    try {
      const result = await performReconciliation(uid, { [walletId]: reportedValue }, { window: span });
      setReconciledGap(result.totalGap);
      setReported('');
      await load();
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Could not save this reconciliation.');
    } finally {
      setReconciling(false);
    }
  }

  const navigateBack = useGoBack();
  return {
    name: account?.name ?? 'Wallet',
    currency: account?.currency ?? '',
    loading: !records && !loadError,
    error: loadError,
    rerun: load,

    windowPresets: WINDOW_PRESETS,
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    span,
    isNow: endsNow(span, new Date()),
    statement,
    breakdown,

    stored: row?.storedBalance ?? 0,
    expected: row?.expectedBalance ?? 0,
    difference: row?.difference ?? 0,
    entryCount: (row?.transactionCount ?? 0) + (row?.transferCount ?? 0),
    fixing,
    fixError,
    fixBalance,

    reported,
    setReported: (v: string) => {
      setReconciledGap(null);
      setReported(v.replace(/[^0-9.-]/g, ''));
    },
    gap,
    reconciling,
    reconcileError,
    reconciledGap,
    reconcile,

    goBack: () => navigateBack(`/wallets/${encodeURIComponent(walletId)}`),
  };
}
