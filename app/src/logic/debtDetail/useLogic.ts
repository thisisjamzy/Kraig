'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, orderBy } from 'firebase/firestore';
import { useFirestoreDoc, useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { debtRef, repaymentsRef } from '@/src/shared/firestore/refs';
import { round2 } from '@/src/shared/firestore/currency';
import { archiveDebt as archiveDebtWrite } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreDebt, FirestoreRepayment } from '@/src/shared/firestore/types';

export function useLogic(debtId: string) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const debtDocRef = useMemo(() => (uid ? debtRef(uid, debtId) : null), [uid, debtId]);
  const { data: debt, loading: debtLoading, error: debtError } = useFirestoreDoc<FirestoreDebt>(debtDocRef);

  const repaymentsQuery = useMemo(
    () => (uid ? query(repaymentsRef(uid, debtId), orderBy('date', 'desc')) : null),
    [uid, debtId]
  );
  const { data: repaymentDocs, loading: repaymentsLoading, error: repaymentsError } =
    useFirestoreCollection<FirestoreRepayment>(repaymentsQuery);

  const currency = debt?.currency ?? '';
  const percent =
    debt && debt.principalAmount > 0 ? Math.min(100, Math.round((debt.totalRepaid / debt.principalAmount) * 100)) : 0;
  const nextPaymentDate =
    debt?.paymentPlan.type === 'recurring' && debt.paymentPlan.recurring
      ? debt.paymentPlan.recurring.nextPaymentDate.toDate()
      : null;

  const repayments = repaymentDocs.map((repayment) => ({
    ...repayment,
    date: repayment.date.toDate(),
  }));

  // Balance trend — PRD Files/prd debt n goals section 4.1, over the debt's
  // entire lifetime (its full start-month-to-now range, no trimming): one
  // point per month, balance = principal minus every repayment dated on or
  // before that month's end. Entirely derived from `repayments`, no
  // separate history collection to keep in sync.
  const trend = useMemo(() => {
    if (!debt) return [];
    const start = debt.startDate.toDate();
    const now = new Date();
    const points: { label: string; monthEnd: Date }[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= last) {
      points.push({
        label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        monthEnd: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return points.map((point) => {
      const repaidByThen = repayments
        .filter((repayment) => repayment.date <= point.monthEnd)
        .reduce((sum, repayment) => sum + repayment.amount, 0);
      return { label: point.label, balance: Math.max(0, round2(debt.principalAmount - repaidByThen)) };
    });
  }, [debt, repayments]);

  async function archiveDebt() {
    if (!uid) return;
    await archiveDebtWrite(uid, debtId);
    router.push('/goals');
  }

  function goBack() {
    router.push('/goals');
  }

  return {
    debt,
    currency,
    percent,
    nextPaymentDate,
    remaining: debt ? round2(debt.currentBalance) : 0,
    repayments,
    trend,
    archiveDebt,
    goBack,
    loading: debtLoading || repaymentsLoading,
    error: debtError || repaymentsError,
  };
}
