'use client';

// Ready to pay, live: this month's automated payments DERIVED from the
// current basket items (src/shared/budget/occurrences.ts), less what the
// user already confirmed or skipped, in priority order; split into what
// this month's received money covers and what waits under "Not enough
// yet" (automation.ts's proposeQueue), with the payments still waiting for
// an income listed apart. Confirming has a 10-second Undo. Shared by the
// Home and Budget cards, the Ready to pay page, the side nav count and the
// notifications runner, so all of them agree.

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { paymentQueueRef } from '@/src/shared/firestore/refs';
import { confirmPayments, saveAmountEdit, skipOccurrence, undoConfirmed, type ConfirmRequest } from '@/src/shared/firestore/paymentQueue';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { proposeQueue } from '@/src/shared/budget/automation';
import { deriveOccurrences, type Occurrence, type OccurrenceAction } from '@/src/shared/budget/occurrences';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { FirestorePaymentQueueEntry } from '@/src/shared/firestore/types';

export type ReadyEntry = Occurrence;

/** Just the count of payments ready now, for the side nav. */
export function useReadyToPayCount(): number {
  return useReadyToPay().ready.length;
}

export function useReadyToPay() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const month = monthKeyOf(new Date());
  const { budget, totals, accounts, ctx, loading: budgetLoading } = useMonthBudget(month);
  const { data, loading } = useFirestoreCollection<FirestorePaymentQueueEntry>(
    useMemo(() => (uid ? query(paymentQueueRef(uid), where('month', '==', month)) : null), [uid, month])
  );
  const [today] = useState(() => new Date());

  const actions = useMemo(() => new Map<string, OccurrenceAction>(data.map((a) => [a.id, a])), [data]);
  const all = useMemo(() => deriveOccurrences(budget, today, actions), [budget, today, actions]);
  const entries = useMemo(() => all.filter((o) => o.state === 'ready'), [all]);
  const waiting = useMemo(() => all.filter((o) => o.state === 'waiting'), [all]);
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

  /** Keeps the amount typed for one payment (until its item's amount changes). */
  async function editAmount(entry: ReadyEntry, amount: number | null) {
    if (!uid) return;
    const same = amount === null || Math.abs(amount - entry.planned) < 0.005;
    await saveAmountEdit(uid, entry, same ? null : amount, ctx.display);
  }
  async function skip(entry: ReadyEntry) {
    if (!uid) return;
    await skipOccurrence(uid, entry, ctx.display);
  }

  return {
    all,
    entries,
    ready: entries,
    waiting,
    editAmount,
    skip,
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
