'use client';

// Reallocate a leftover (Planning) — a full page for a bucket's (or one
// item's) money left over: send it to another bucket's item (overspent
// ones first), to savings (a real wallet → savings transfer), or to next
// month's same items. Each move is an allocation from the item(s) it
// leaves.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { createAllocation } from '@/src/shared/firestore/bucketBudget';
import { showToast } from '@/src/widgets/Toast/Toast';
import { addMonths, itemOccurrence } from '@/src/shared/budget/monthBudget';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { monthOf, monthTitle, money, takeFrom, unexplained, type Need } from '@/src/viewmodels/planning';

export type Destination = 'bucket' | 'savings' | 'next';

function paramsFromSearch() {
  if (typeof window === 'undefined') return { month: monthOf(new Date()), bucket: '', item: null as string | null };
  const q = new URLSearchParams(window.location.search);
  const month = q.get('month');
  return {
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : monthOf(new Date()),
    bucket: q.get('bucket') ?? '',
    item: q.get('item'),
  };
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [{ month, bucket: bucketId, item: itemId }] = useState(paramsFromSearch);
  const data = useMonthBudget(month);
  const { budget, itemsByBucket, accounts, ctx } = data;

  const group = budget.buckets.find((g) => g.bucketId === bucketId) ?? null;
  const sourceItems = (group?.items ?? []).filter((i) => (!itemId || i.itemId === itemId) && i.type !== 'Income' && i.remaining > 0);
  // Only the bucket's NET leftover can leave it: an item's spare money
  // first covers a sibling that went over its estimate.
  const netLeftover = Math.max(
    0,
    Math.round((group?.items ?? []).filter((i) => i.type !== 'Income').reduce((s, i) => s + i.remaining, 0) * 100) / 100
  );
  const pots: Need[] = takeFrom(
    sourceItems.sort((a, b) => b.remaining - a.remaining).map((i) => ({ key: i.key, amount: i.remaining })),
    netLeftover
  );
  const total = Math.round(pots.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const nextMonth = addMonths(month, 1);
  // Only items that recur next month can roll over.
  const nextPots = pots.filter((p) => {
    const e = budget.itemsByKey.get(p.key)!;
    const raw = itemsByBucket[e.bucketId]?.find((i) => i.id === e.itemId);
    return Boolean(raw && itemOccurrence(raw, nextMonth));
  });
  const nextTotal = Math.round(nextPots.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  // Bucket targets: other items this month, overspent ones first.
  const targets = useMemo(
    () =>
      budget.items
        .filter((i) => i.type !== 'Income' && !(i.bucketId === bucketId && (!itemId || i.itemId === itemId)))
        .map((i) => ({ key: i.key, name: i.name, bucketName: i.bucketName, needs: unexplained(i), remaining: i.remaining }))
        .sort((a, b) => b.needs - a.needs || a.bucketName.localeCompare(b.bucketName) || a.name.localeCompare(b.name)),
    [budget.items, bucketId, itemId]
  );
  const savingsAccounts = accounts.filter(isSavingsAccount);
  const wallets = accounts.filter((a) => !isSavingsAccount(a));

  const [destination, setDestination] = useState<Destination>('bucket');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [savingsId, setSavingsId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [amountString, setAmountString] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = destination === 'next' ? nextTotal : total;
  const amount = Number(amountString) || 0;
  const target = targetKey ? targets.find((t) => t.key === targetKey) ?? null : targets[0] ?? null;
  const savingsAccount = savingsAccounts.find((a) => a.id === savingsId) ?? savingsAccounts[0] ?? null;
  const firstSource = sourceItems[0] ? data.transactionsById.get(sourceItems[0].transactionIds.at(-1) ?? '') : undefined;
  const wallet = wallets.find((a) => a.id === walletId) ?? wallets.find((a) => a.id === firstSource?.accountId) ?? wallets[0] ?? null;

  function quick(fraction: number) {
    setAmountString(String(Math.round(limit * fraction * 100) / 100));
  }

  const fromName = sourceItems.length === 1 ? sourceItems[0].name : group?.name ?? '';
  let summary = '';
  if (amount > 0) {
    if (destination === 'bucket' && target) summary = `Move ${money(amount)} ${ctx.display} from ${fromName} to ${target.name} (${target.bucketName}).`;
    if (destination === 'savings' && savingsAccount && wallet)
      summary = `Move ${money(amount)} ${ctx.display} from ${fromName} into ${savingsAccount.name}, a real transfer out of ${wallet.name}.`;
    if (destination === 'next') summary = `Add ${money(amount)} ${ctx.display} to ${fromName} in ${monthTitle(nextMonth)}.`;
  }

  let problem: string | null = null;
  if (!(amount > 0)) problem = 'Enter an amount.';
  else if (amount > limit + 0.005) problem = `Only ${money(limit)} ${ctx.display} can move there.`;
  else if (destination === 'bucket' && !target) problem = 'Pick where it goes.';
  else if (destination === 'savings' && (!savingsAccount || !wallet)) problem = 'You need a savings account and a wallet for this.';
  const canConfirm = !problem && !busy;

  async function confirm() {
    if (!uid || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const gives = takeFrom(destination === 'next' ? nextPots : pots, amount);
      for (const give of gives) {
        const from = budget.itemsByKey.get(give.key)!;
        const fromEndpoint = { kind: 'item' as const, bucketId: from.bucketId, itemId: from.itemId, month };
        if (destination === 'bucket' && target) {
          const to = budget.itemsByKey.get(target.key)!;
          await createAllocation(
            uid,
            {
              month,
              from: fromEndpoint,
              to: { kind: 'item', bucketId: to.bucketId, itemId: to.itemId, month },
              amount: give.amount,
              currency: ctx.display,
              reason: 'reallocate_leftover',
              note: note.trim(),
            },
            ctx
          );
        } else if (destination === 'savings' && savingsAccount && wallet) {
          await createAllocation(
            uid,
            {
              month,
              from: fromEndpoint,
              to: { kind: 'savings', accountId: savingsAccount.id },
              amount: give.amount,
              currency: ctx.display,
              reason: 'reallocate_leftover',
              note: note.trim() || `Leftover from ${from.name}`,
              savingsFromAccountId: wallet.id,
            },
            ctx
          );
        } else if (destination === 'next') {
          await createAllocation(
            uid,
            {
              month,
              from: fromEndpoint,
              to: { kind: 'item', bucketId: from.bucketId, itemId: from.itemId, month: nextMonth },
              amount: give.amount,
              currency: ctx.display,
              reason: 'reallocate_leftover',
              note: note.trim(),
            },
            ctx
          );
        }
      }
      showToast('Money moved.');
      goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move that money.');
    } finally {
      setBusy(false);
    }
  }

  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(`/budget/basket/${bucketId}?month=${month}`);
  }

  return {
    month,
    nextMonth,
    currency: ctx.display,
    loading: data.loading,
    fromName,
    total,
    nextTotal,
    destination,
    setDestination,
    note,
    setNote,
    targets,
    target,
    setTargetKey,
    savingsAccounts,
    savingsAccount,
    setSavingsId,
    wallets,
    wallet,
    setWalletId,
    amountString,
    setAmountString,
    quick,
    limit,
    summary,
    problem,
    canConfirm,
    confirm,
    busy,
    error,
    goBack,
  };
}
