'use client';

// The Ready to pay queue, live: every prepared payment still waiting, in
// priority order, split into what this month's received money covers and
// what waits under "Not enough yet" (automation.ts's proposeQueue), plus
// confirming with a 10-second Undo. Shared by the Home and Budget cards and
// the Ready to pay page, so all three propose the same payments.

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { paymentQueueRef } from '@/src/shared/firestore/refs';
import { confirmPayments, undoConfirmed, type ConfirmRequest } from '@/src/shared/firestore/paymentQueue';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { proposeQueue } from '@/src/shared/budget/automation';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { FirestorePaymentQueueEntry } from '@/src/shared/firestore/types';

export interface ReadyEntry extends FirestorePaymentQueueEntry {
  due: Date | null;
}

/** Just the count, for the side nav — one small query. */
export function useReadyToPayCount(): number {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data } = useFirestoreCollection<FirestorePaymentQueueEntry>(
    useMemo(() => (uid ? query(paymentQueueRef(uid), where('status', '==', 'ready')) : null), [uid])
  );
  return data.length;
}

export function useReadyToPay() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const month = monthKeyOf(new Date());
  const { totals, accounts, ctx, loading: budgetLoading } = useMonthBudget(month);
  const { data, loading } = useFirestoreCollection<FirestorePaymentQueueEntry>(
    useMemo(() => (uid ? query(paymentQueueRef(uid), where('status', '==', 'ready')) : null), [uid])
  );

  const entries = useMemo<ReadyEntry[]>(() => data.map((e) => ({ ...e, due: e.dueDate?.toDate() ?? null })), [data]);
  // What the money received this month still covers.
  const available = totals.availableNowRaw;
  const proposal = useMemo(() => proposeQueue(entries, available), [entries, available]);

  // The income that set this off, for the card's heading.
  const trigger = entries.find((e) => e.trigger.incomeName)?.trigger ?? null;
  const count = entries.length;
  const headline = trigger
    ? `${trigger.incomeName} received: ${Math.round(trigger.incomeAmount ?? 0).toLocaleString('en-US')} ${ctx.display}. ${count} ${count === 1 ? 'payment is' : 'payments are'} ready.`
    : `${count} ${count === 1 ? 'payment is' : 'payments are'} ready.`;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountType = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts]);

  async function confirm(requests: ConfirmRequest[]) {
    if (!uid || !requests.length) return false;
    setBusy(true);
    setError(null);
    const { records, error: failed } = await confirmPayments(uid, requests, ctx, accountType);
    setBusy(false);
    if (failed) setError(failed);
    if (records.length) {
      showToast(`${records.length} ${records.length === 1 ? 'payment' : 'payments'} recorded`, {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => {
            undoConfirmed(uid, records, ctx)
              .then(() => showToast('Payments put back in Ready to pay'))
              .catch((caught) => showToast(caught instanceof Error ? caught.message : 'Could not undo that.'));
          },
        },
      });
    }
    return !failed;
  }

  return {
    entries,
    proposed: proposal.proposed,
    notEnough: proposal.notEnough,
    available,
    headline,
    count,
    currency: ctx.display,
    accounts: accounts.filter((a) => !a.archived && !a.frozen),
    confirm,
    busy,
    error,
    loading: loading || budgetLoading,
  };
}

export type ReadyToPay = ReturnType<typeof useReadyToPay>;
