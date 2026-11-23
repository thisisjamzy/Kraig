'use client';

// Unaccounted money and the accountability rate per month or week
// (viewmodels/accountability.ts), read live from the ledger: transactions,
// transfers and balance checks dated in the range, in the display currency
// and the household's time zone. Never a stored running total, so closing a
// month can never carry its figure into the next one.

import { useMemo } from 'react';
import { query, where, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { accountsRef, reconciliationsRef, transactionsRef, transfersRef, UNJUSTIFIED_WALLET_ID } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useCurrencyContext, useSettings } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import {
  DEFAULT_TIME_ZONE,
  periodKey,
  rangeStart,
  unaccountedByPeriod,
  type Period,
  type PeriodAccountability,
} from '@/src/viewmodels/accountability';
import type { FirestoreAccount, FirestoreReconciliation, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

/** The household's time zone (Settings), Africa/Douala when unset. */
export function useTimeZone(): string {
  const { data } = useSettings();
  return data?.timezone || DEFAULT_TIME_ZONE;
}

/** A month key ("2026-11") as a moment inside that month (its 15th, noon UTC). */
export function monthAnchor(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15, 12));
}

export function useAccountability({
  period,
  count,
  month,
}: {
  period: Period;
  count: number;
  /** The last month shown ("2026-11"); this month or week when left out. */
  month?: string | null;
}): { rows: PeriodAccountability[]; current: PeriodAccountability | null; loading: boolean } {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();
  const timeZone = useTimeZone();
  // A stable key for the end of the range, so queries don't re-run per render.
  const endKey = month ?? periodKey(new Date(), period, timeZone);
  const end = useMemo(() => (month ? monthAnchor(month) : new Date()), [endKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // One period before the first shown, for its change.
  const start = useMemo(() => Timestamp.fromDate(rangeStart(end, count + 1, period, timeZone)), [end, count, period, timeZone]);

  const tx = useFirestoreCollection<FirestoreTransaction>(useMemo(() => (uid ? query(transactionsRef(uid), where('date', '>=', start)) : null), [uid, start]));
  const transfers = useFirestoreCollection<FirestoreTransfer>(useMemo(() => (uid ? query(transfersRef(uid), where('date', '>=', start)) : null), [uid, start]));
  const checks = useFirestoreCollection<FirestoreReconciliation>(
    useMemo(() => (uid ? query(reconciliationsRef(uid), where('performedAt', '>=', start)) : null), [uid, start])
  );
  // Every wallet, archived and system ones included: own-wallet transfers
  // are not outflow, and each amount is in its wallet's currency.
  const wallets = useFirestoreCollection<FirestoreAccount>(useMemo(() => (uid ? accountsRef(uid) : null), [uid]));

  return useMemo(() => {
    const currencyOf = new Map(wallets.data.map((a) => [a.id, a.currency]));
    const display = (amount: number, accountId: string) => toDisplay(ctx, amount, currencyOf.get(accountId) ?? ctx.base);
    const rows = unaccountedByPeriod(
      tx.data
        .filter((t) => t.date)
        .map((t) => ({
          date: t.date.toDate(),
          amount: display(t.amount, t.accountId),
          direction: t.direction,
          accountId: t.accountId,
          isUnjustifiedAdjustment: t.isUnjustifiedAdjustment,
          isFrozenSavings: t.isFrozenSavings,
          pairedTransferId: t.pairedTransferId,
          excluded: t.excluded,
        })),
      // A check's gap is a sum of ledger balances in the base currency.
      checks.data.filter((r) => r.performedAt).map((r) => ({ performedAt: r.performedAt.toDate(), totalGap: toDisplay(ctx, r.totalGap, ctx.base) })),
      {
        period,
        range: { end, count },
        timeZone,
        unaccountedWalletId: UNJUSTIFIED_WALLET_ID,
        ownWalletIds: new Set(wallets.data.map((a) => a.id)),
        transfers: transfers.data
          .filter((t) => t.date)
          .map((t) => ({
            id: t.id,
            date: t.date.toDate(),
            amount: display(t.amount, t.fromAccountId),
            charges: display(t.charges ?? 0, t.fromAccountId),
            fromAccountId: t.fromAccountId,
            toAccountId: t.toAccountId ?? null,
          })),
      }
    );
    return {
      rows,
      current: rows[rows.length - 1] ?? null,
      loading: tx.loading || transfers.loading || checks.loading || wallets.loading,
    };
  }, [tx.data, tx.loading, transfers.data, transfers.loading, checks.data, checks.loading, wallets.data, wallets.loading, ctx, period, end, count, timeZone]);
}
