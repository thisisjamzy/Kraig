'use client';

// One budget month's unaccounted money (src/shared/budget/unaccounted.ts):
// the reconciliations done in it and the expenses explained against
// unaccounted money dated in it, in the display currency.

import { useMemo } from 'react';
import { query, where, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { reconciliationsRef, transactionsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useAccounts, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { monthUnaccounted, type MonthUnaccounted } from '@/src/shared/budget/unaccounted';
import type { FirestoreReconciliation, FirestoreTransaction } from '@/src/shared/firestore/types';

export function useMonthUnaccounted(month: string | null): MonthUnaccounted & { loading: boolean; lastCheckAt: Date | null } {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();
  const { data: accounts } = useAccounts();

  const range = useMemo(() => {
    if (!month) return null;
    const [y, m] = month.split('-').map(Number);
    return { start: Timestamp.fromDate(new Date(y, m - 1, 1)), end: Timestamp.fromDate(new Date(y, m, 1)) };
  }, [month]);
  const checks = useFirestoreCollection<FirestoreReconciliation>(
    useMemo(
      () => (uid && range ? query(reconciliationsRef(uid), where('performedAt', '>=', range.start), where('performedAt', '<', range.end)) : null),
      [uid, range]
    )
  );
  const explained = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid && month ? query(transactionsRef(uid), where('isUnjustifiedAdjustment', '==', true), where('month', '==', month)) : null), [uid, month])
  );

  return useMemo(() => {
    // A check's gap is a sum of ledger balances in the household's base currency.
    const recons = checks.data.filter((r) => r.performedAt).map((r) => ({ performedAt: r.performedAt.toDate(), totalGap: toDisplay(ctx, r.totalGap, ctx.base) }));
    const currencyOf = (accountId: string) => accounts.find((a) => a.id === accountId)?.currency ?? ctx.base;
    const adj = explained.data.map((t) => ({ date: t.date.toDate(), amount: toDisplay(ctx, t.amount, currencyOf(t.accountId)), direction: t.direction }));
    const lastCheckAt = recons.reduce<Date | null>((latest, r) => (!latest || r.performedAt > latest ? r.performedAt : latest), null);
    return { ...monthUnaccounted(month ?? '', recons, adj), lastCheckAt, loading: checks.loading || explained.loading };
  }, [checks.data, checks.loading, explained.data, explained.loading, month, ctx, accounts]);
}
