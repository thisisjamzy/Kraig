'use client';

// The Money dashboard: the period (usePeriod), the finance model, wallets,
// debts and reconciliation checks, turned into one view model per card
// (src/viewmodels/dashboard/money.ts) for the period's layout. Live: every
// source is a Firestore listener, so a new entry updates the figures.

import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { useFinanceData } from '@/src/logic/financeInsights/useFinanceData';
import { classifySpending } from '@/src/viewmodels/finance/classify';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { debtsRef, reconciliationsRef } from '@/src/shared/firestore/refs';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { usePeriod } from '@/src/shared/dashboard/usePeriod';
import { cardsIn, MONEY_LAYOUT } from '@/src/shared/dashboard/layouts';
import { moneyDashboard, type MoneyInput } from '@/src/viewmodels/dashboard/money';
import type { FirestoreDebt, FirestoreReconciliation } from '@/src/shared/firestore/types';

const MONTHLY: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 };

export function useMoneyDashboard() {
  const fin = useFinanceData();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const debts = useFirestoreCollection<FirestoreDebt>(useMemo(() => (uid ? query(debtsRef(uid), where('archivedAt', '==', null)) : null), [uid]));
  const checks = useFirestoreCollection<FirestoreReconciliation>(useMemo(() => (uid ? query(reconciliationsRef(uid)) : null), [uid]));

  const first = useMemo(() => {
    const m = fin.data.firstMonth;
    if (!m) return null;
    return new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
  }, [fin.data.firstMonth]);
  const p = usePeriod('money', first);
  const layout = MONEY_LAYOUT[p.kind];

  const input: MoneyInput = useMemo(() => {
    const { ctx } = fin;
    const currencyOf = (id: string) => fin.accounts.find((a) => a.id === id)?.currency ?? ctx.base;
    const wallets = fin.accounts.filter((a) => !a.archived && !a.isSystemWallet).map((a) => ({ id: a.id, name: a.name, type: a.type, balance: toDisplay(ctx, a.currentBalance, a.currency) }));
    const known = new Set(wallets.map((w) => w.id));
    return {
      data: fin.data,
      splits: classifySpending(fin.data.txs, fin.data),
      currency: fin.currency,
      wallets,
      debts: debts.data.map((d) => ({
        id: d.id,
        name: d.name,
        principal: toDisplay(ctx, d.principalAmount, d.currency),
        outstanding: toDisplay(ctx, Math.max(0, d.currentBalance), d.currency),
        monthly: d.paymentPlan?.type === 'recurring' && d.paymentPlan.recurring?.isActive ? toDisplay(ctx, d.paymentPlan.recurring.amount * (MONTHLY[d.paymentPlan.recurring.interval] ?? 1), d.currency) : null,
      })),
      // A check counted every wallet at once: per wallet, what the records
      // said (ledger) and what was counted (reported).
      checks: checks.data
        .filter((c) => c.performedAt)
        .map((c) => ({
          at: c.performedAt.toDate(),
          wallets: Object.keys(c.reportedBalances ?? {})
            .filter((id) => known.has(id) || id in (c.ledgerBalancesAtTime ?? {}))
            .map((id) => ({
              id,
              recorded: toDisplay(ctx, c.ledgerBalancesAtTime?.[id] ?? 0, currencyOf(id)),
              counted: toDisplay(ctx, c.reportedBalances[id] ?? 0, currencyOf(id)),
            })),
        })),
      savingsGoal: (() => {
        const goal = fin.buckets.filter((b) => !b.archived && b.type === 'Savings' && (b.targetAmount ?? 0) > 0).reduce((sum, b) => sum + toDisplay(ctx, b.targetAmount ?? 0, b.currency), 0);
        return goal > 0 ? goal : null;
      })(),
      untrackedTarget: 0.02,
    };
  }, [fin, debts.data, checks.data]);

  const dash = useMemo(() => moneyDashboard(input, p.period, cardsIn(layout)), [input, p.period, layout]);

  return { ...p, layout, dash, loading: fin.loading || debts.loading || checks.loading };
}
