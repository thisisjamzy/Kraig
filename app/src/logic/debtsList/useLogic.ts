'use client';

// Debt hub — its own bottom-nav tab, split from Goals (src/logic/goals is
// Goals' own equivalent hub now) per the "two separate pages" request: they
// used to share one Goals & Debt screen behind an in-page tab. List-level
// data only — a debt's repayment history/trend lives on its own detail
// screen (src/logic/debtDetail).

import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { debtsRef, repaymentsRef } from '@/src/shared/firestore/refs';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { archiveDebt as archiveDebtWrite } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreDebt, FirestoreRepayment, DebtPriority } from '@/src/shared/firestore/types';

const PRIORITY_ORDER: DebtPriority[] = ['high', 'medium', 'low'];

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const debtsQuery = useMemo(() => (uid ? query(debtsRef(uid), where('archivedAt', '==', null)) : null), [uid]);
  const { data: debtDocs, loading: debtsLoading, error: debtsError } = useFirestoreCollection<FirestoreDebt>(debtsQuery);

  const currency = ctx.display;

  const debts = useMemo(
    () =>
      debtDocs
        .map((debt) => {
          const principal = round2(toDisplay(ctx, debt.principalAmount, ctx.base));
          const balance = round2(toDisplay(ctx, debt.currentBalance, ctx.base));
          const repaid = round2(toDisplay(ctx, debt.totalRepaid, ctx.base));
          return {
            id: debt.id,
            name: debt.name,
            debtType: debt.debtType,
            priority: debt.priority,
            principal,
            balance,
            repaid,
            percent: principal > 0 ? Math.min(100, Math.round((repaid / principal) * 100)) : 0,
            nextPaymentDate:
              debt.paymentPlan.type === 'recurring' && debt.paymentPlan.recurring
                ? debt.paymentPlan.recurring.nextPaymentDate.toDate()
                : null,
          };
        })
        .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)),
    [debtDocs, ctx]
  );

  const debtSummary = useMemo(() => {
    const byPriority: Record<DebtPriority, number> = { high: 0, medium: 0, low: 0 };
    const byType = { cash: 0, existing: 0 };
    let totalDebt = 0;
    let totalFinanced = 0;
    let totalRefunded = 0;
    let nextPaymentDate: Date | null = null;
    for (const debt of debts) {
      totalDebt += debt.balance;
      totalFinanced += debt.principal;
      totalRefunded += debt.repaid;
      byPriority[debt.priority] += debt.balance;
      byType[debt.debtType] += debt.balance;
      if (debt.nextPaymentDate && (!nextPaymentDate || debt.nextPaymentDate < nextPaymentDate)) {
        nextPaymentDate = debt.nextPaymentDate;
      }
    }
    return {
      totalDebt: round2(totalDebt),
      totalFinanced: round2(totalFinanced),
      totalRefunded: round2(totalRefunded),
      nextPaymentDate,
      byPriority,
      byType,
      debtCount: debts.length,
    };
  }, [debts]);

  // Total-debt-over-time chart — needs every debt's own repayment history,
  // which a debts-collection query alone doesn't carry (repayments are a
  // subcollection per debt). Fanning out one onSnapshot per debt id (rather
  // than a collectionGroup query) avoids needing a composite index just for
  // this chart — keyed off a stable, sorted id string so an unrelated field
  // changing on a debt doc (still the same set of ids) doesn't tear down
  // and resubscribe every listener.
  const [repaymentsByDebt, setRepaymentsByDebt] = useState<Record<string, FirestoreRepayment[]>>({});
  const debtIdsKey = debtDocs.map((debt) => debt.id).sort().join(',');
  useEffect(() => {
    if (!uid || debtDocs.length === 0) {
      setRepaymentsByDebt({});
      return;
    }
    const unsubscribers = debtDocs.map((debt) =>
      onSnapshot(repaymentsRef(uid, debt.id), (snap) => {
        setRepaymentsByDebt((current) => ({
          ...current,
          [debt.id]: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<FirestoreRepayment, 'id'>) })),
        }));
      })
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, debtIdsKey]);

  // One point per month, from the earliest debt's start month to now (its
  // "entire lifetime") — total outstanding balance across every debt still
  // active at that point, each converted to the display currency.
  const totalDebtTrend = useMemo(() => {
    if (debtDocs.length === 0) return [];
    const earliestStart = new Date(Math.min(...debtDocs.map((debt) => debt.startDate.toDate().getTime())));
    const now = new Date();
    const points: { label: string; monthEnd: Date }[] = [];
    const cursor = new Date(earliestStart.getFullYear(), earliestStart.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= last) {
      points.push({
        label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        monthEnd: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return points.map((point) => {
      let total = 0;
      for (const debt of debtDocs) {
        if (debt.startDate.toDate() > point.monthEnd) continue;
        const repaidByThen = (repaymentsByDebt[debt.id] ?? [])
          .filter((repayment) => repayment.date.toDate() <= point.monthEnd)
          .reduce((sum, repayment) => sum + repayment.amount, 0);
        total += toDisplay(ctx, Math.max(0, debt.principalAmount - repaidByThen), debt.currency);
      }
      return { label: point.label, total: round2(total) };
    });
  }, [debtDocs, repaymentsByDebt, ctx]);

  async function archiveDebt(id: string) {
    if (!uid) return;
    await archiveDebtWrite(uid, id);
  }

  return {
    currency,
    debts,
    debtSummary,
    totalDebtTrend,
    archiveDebt,
    loading: ctxLoading || debtsLoading,
    error: debtsError,
  };
}
