'use client';

// Client-side replacement for functions/src/transactions.ts,
// functions/src/transfers.ts, and functions/src/lib/budgetProgress.ts — this
// project runs on the Firebase Spark (free) plan, which doesn't support
// Cloud Functions (that needs Blaze, for Cloud Build/Artifact Registry), so
// there are no onWrite triggers deployed. See firestore.rules' header for
// the trade-off this implies.
//
// Every function here takes `uid` explicitly and only ever touches that
// uid's own subcollections (refs.ts) — each account's ledger is private
// (see refs.ts's header).
//
// Only covers what the app's write UI actually does today (verified against
// every setDoc/updateDoc call site in src/logic): create/edit/delete a
// transaction (including its type, per src/logic/editTransaction/useLogic.ts),
// create/edit/delete a transfer (per src/logic/editTransfer/useLogic.ts),
// create/edit-amount/archive a budget rule.
// updateTransactionWithAggregation/deleteTransactionWithAggregation and
// updateTransferWithAggregation/deleteTransferWithAggregation are the
// reverse-(then-apply) paths (see their own doc comments) — everything else
// here only ever applies a new contribution, never has to reverse an old one.

import {
  runTransaction,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp,
  writeBatch,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import {
  accountRef,
  transactionRef,
  transactionsRef,
  transferRef,
  transfersRef,
  statsHomeRef,
  statsMonthlyRef,
  allocationsRef,
  bucketRef,
  bucketLineItemsRef,
  bucketLineItemRef,
  debtRef,
  repaymentsRef,
  repaymentRef,
  UNJUSTIFIED_WALLET_ID,
  unjustifiedWalletRef,
} from './refs';
import { convert, round2, type CurrencyContext } from './currency';
import { writeDebtActivity } from './debtWrites';
import type {
  DebtPaidFrom,
  FirestoreDebtPaymentPlan,
  DebtType,
  DebtPriority,
  BudgetLineType,
  Priority,
  BucketItemNecessity,
  Frequency,
  BucketLineItemSubItem,
  BucketItemLink,
  FirestoreTransaction,
  IncomeSubtype,
} from './types';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Throws if debiting `delta` (a negative native-currency amount; a positive
 * or zero delta never needs checking) would take an account's balance below
 * its own lockedAmount — the portion of the wallet set aside and blocked
 * from spending without freezing the whole thing (FirestoreAccount.lockedAmount,
 * set from src/logic/walletDetail/useLogic.ts). Mirrors the existing
 * `frozen` check's shape, just for a partial rather than total block.
 */
function assertNotBelowLocked(account: { currentBalance?: number; lockedAmount?: number } | undefined, delta: number) {
  if (delta >= 0) return;
  const currentBalance = account?.currentBalance ?? 0;
  const lockedAmount = account?.lockedAmount ?? 0;
  if (currentBalance + delta < lockedAmount) {
    throw new Error('This would dip into the amount locked in this wallet, unlock some of it first, or use a smaller amount.');
  }
}

/**
 * An excluded transaction (its debt changed to record only) already had its
 * effect reversed: editing or deleting it here would reverse it twice. It
 * changes through its debt (src/shared/firestore/debtWrites.ts) instead.
 */
function assertCounted(transaction: { excluded?: boolean }) {
  if (transaction.excluded) {
    throw new Error('This transaction is excluded from your figures because its debt is record only. Change the debt\u2019s wallet effect instead.');
  }
}

export interface CreateTransactionInput {
  id: string;
  date: Date;
  type: string;
  description: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  createdBy: string;
  // Set only when this transaction IS a 'cash' debt's repayment — see
  // FirestoreDebt.debtType and recordRepaymentWithAggregation below, which
  // is the only other caller that ever passes these.
  isDebtRepayment?: boolean;
  linkedDebtId?: string | null;
  // PRD-AUDIT-RECONCILIATION.md — set only by createBackfillSpread (a
  // recurring transaction spread across a range of past months) and
  // recordTransactionExplainingUnjustifiedBalance/recordIncomeExplainingUnjustifiedBalance
  // (below) respectively; every other caller leaves these undefined.
  isHistoricBackfill?: boolean;
  backfillBatchId?: string | null;
  isUnjustifiedAdjustment?: boolean;
  pairedTransferId?: string | null;
  // See FirestoreTransaction.isFrozenSavings (types.ts) — only ever true
  // for a Savings-type, Outflow-direction entry; callers enforce that, this
  // function trusts it rather than re-validating type/direction itself.
  isFrozenSavings?: boolean;
  // PRD-BUDGETS-V2.md section 4.3 — the bucket item occurrence this pays
  // for, see FirestoreTransaction.bucketItem.
  bucketItem?: BucketItemLink | null;
  // Income only — see FirestoreTransaction.incomeSubtype. Debt financing
  // also stores linkedDebtId (the cash debt it created or adds to).
  incomeSubtype?: IncomeSubtype | null;
}

/**
 * The write half of "record a transaction" — account currentBalance,
 * statsMonthly, stats-home, the same fields onTransactionWrite's
 * applyDelta() used to maintain via a trigger — factored out so
 * recordBucketLineItemPayment and recordRepaymentWithAggregation (both of
 * which also need to write a real transaction, inside their OWN
 * runTransaction() alongside a bucket/debt write) can reuse the exact same
 * math instead of re-deriving it. Every read this needs (the account snap,
 * for its currency and frozen/lockedAmount checks) must already have
 * happened before this runs — Firestore transactions require all reads
 * before any writes, and this function only ever writes.
 */
export function writeTransactionContribution(
  tx: import('firebase/firestore').Transaction,
  uid: string,
  input: CreateTransactionInput,
  accountData: { currency?: string; frozen?: boolean; lockedAmount?: number; currentBalance?: number } | undefined,
  ctx: CurrencyContext
): number {
  const signedAmount = input.direction === 'Inflow' ? input.amount : -input.amount;
  if (accountData?.frozen) {
    throw new Error('This wallet is frozen, unfreeze it before recording a transaction against it.');
  }
  if (input.isFrozenSavings) {
    // Money never leaves the account — only lockedAmount grows. This isn't
    // the ordinary "would this debit dip below what's locked" question
    // (currentBalance isn't moving at all here); it's "is there enough
    // unlocked balance in this account to lock this much in the first
    // place".
    const currentBalance = accountData?.currentBalance ?? 0;
    const lockedAmount = accountData?.lockedAmount ?? 0;
    if (currentBalance < lockedAmount + input.amount) {
      throw new Error('Not enough unlocked balance in this wallet to freeze that much.');
    }
  } else {
    assertNotBelowLocked(accountData, signedAmount);
  }
  const month = monthKey(input.date);
  const currentMonth = monthKey(new Date());
  const dateTimestamp = Timestamp.fromDate(input.date);
  const nativeCurrency = accountData?.currency ?? ctx.base;
  const convertedDelta = convert(signedAmount, nativeCurrency, ctx.base, ctx.rates);
  const income = convertedDelta > 0 ? convertedDelta : 0;
  const expense = convertedDelta < 0 ? -convertedDelta : 0;

  tx.set(transactionRef(uid, input.id), {
    date: dateTimestamp,
    type: input.type,
    description: input.description,
    accountId: input.accountId,
    categoryId: input.categoryId,
    amount: input.amount,
    direction: input.direction,
    signedAmount,
    month,
    ...(input.isDebtRepayment ? { isDebtRepayment: true, linkedDebtId: input.linkedDebtId ?? null } : {}),
    ...(input.isHistoricBackfill ? { isHistoricBackfill: true, backfillBatchId: input.backfillBatchId ?? null } : {}),
    ...(input.isUnjustifiedAdjustment
      ? { isUnjustifiedAdjustment: true, pairedTransferId: input.pairedTransferId ?? null }
      : {}),
    ...(input.isFrozenSavings ? { isFrozenSavings: true } : {}),
    ...(input.type === 'Income' && input.incomeSubtype ? { incomeSubtype: input.incomeSubtype } : {}),
    ...(input.incomeSubtype === 'debt_financing' && input.linkedDebtId && !input.isDebtRepayment ? { linkedDebtId: input.linkedDebtId } : {}),
    bucketItem: input.bucketItem ?? null,
    createdBy: input.createdBy,
    createdAt: dateTimestamp,
  });

  if (input.isFrozenSavings) {
    tx.update(accountRef(uid, input.accountId), { lockedAmount: increment(input.amount) });
  } else {
    tx.update(accountRef(uid, input.accountId), { currentBalance: increment(signedAmount) });
  }

  const monthUpdate: Record<string, unknown> = {
    totalIncome: increment(income),
    totalExpense: increment(expense),
    transactionCount: increment(1),
    lastUpdated: serverTimestamp(),
  };
  if (input.categoryId) {
    // perCategorySpend tracks "progress toward this category's budget", not
    // literally net expense — for an Income category the normal (Inflow)
    // transaction should INCREASE progress, so the sign flips relative to
    // an Expense category's convention (see the matching comments in
    // updateTransactionWithAggregation/deleteTransactionWithAggregation).
    monthUpdate.perCategorySpend = { [input.categoryId]: increment(input.type === 'Income' ? income - expense : expense - income) };
    monthUpdate.perCategoryCount = { [input.categoryId]: increment(1) };
  }
  tx.set(statsMonthlyRef(uid, month), monthUpdate, { merge: true });

  const homeUpdate: Record<string, unknown> = {
    // Net worth doesn't move for a frozen-savings entry — the money never
    // left the household's accounts, it just changed from spendable to
    // locked within the same one.
    totalBalanceBase: increment(input.isFrozenSavings ? 0 : convertedDelta),
    lastUpdated: serverTimestamp(),
  };
  if (month === currentMonth) {
    homeUpdate.thisMonthIncome = increment(income);
    homeUpdate.thisMonthExpense = increment(expense);
  }
  tx.set(statsHomeRef(uid), homeUpdate, { merge: true });

  return signedAmount;
}

/**
 * Keeps a bucket item's legacy `payments[]` list (still what Bucket Detail's
 * payment history renders) in step with the transaction/transfer that is
 * now the real source of truth (FirestoreTransaction.bucketItem,
 * PRD-BUDGETS-V2.md section 4.3). `amount: null` removes the payment;
 * otherwise it's upserted. A missing item (deleted since) is ignored.
 */
export async function syncLinkedItemPayment(
  uid: string,
  link: BucketItemLink,
  paymentId: string,
  kind: 'expense' | 'transfer',
  payment: { amount: number; date: Date } | null
): Promise<void> {
  const ref = bucketLineItemRef(uid, link.bucketId, link.itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const existing = (snap.data().payments ?? []).filter((entry) => entry.id !== paymentId);
  const payments = payment
    ? [...existing, { id: paymentId, kind, amount: payment.amount, date: Timestamp.fromDate(payment.date) }].sort(
        (a, b) => a.date.toMillis() - b.date.toMillis()
      )
    : existing;
  await updateDoc(ref, {
    payments,
    actualAmount: payments.length > 0 ? round2(payments.reduce((sum, entry) => sum + entry.amount, 0)) : null,
    updatedAt: serverTimestamp(),
  });
}

function sameLink(a: BucketItemLink | null | undefined, b: BucketItemLink | null | undefined) {
  return Boolean(a && b && a.itemId === b.itemId && a.bucketId === b.bucketId);
}

/**
 * Writes a new transaction and, in the same runTransaction(), updates its
 * account's currentBalance and statsMonthly/stats-home via
 * writeTransactionContribution above. statsBudgetProgress is recomputed
 * afterward (needs a query, which Firestore transactions can't run — same
 * ordering onTransactionWrite itself used, see its own comment on why that
 * recompute runs after the batch commits, not inside it). `input.createdBy`
 * doubles as the uid whose subcollections this writes to — the caller is
 * always the account owner writing their own data (see refs.ts's header).
 */
export async function createTransactionWithAggregation(input: CreateTransactionInput, ctx: CurrencyContext) {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();

  await runTransaction(db, async (tx) => {
    const accountSnap = await tx.get(accountRef(uid, input.accountId));
    writeTransactionContribution(tx, uid, input, accountSnap.data(), ctx);
  });

  if (input.bucketItem) {
    await syncLinkedItemPayment(uid, input.bucketItem, input.id, 'expense', { amount: input.amount, date: input.date });
  }

}

export interface UpdateTransactionInput {
  id: string;
  date: Date;
  type: string;
  description: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  // undefined leaves the existing link alone; null unlinks it.
  bucketItem?: BucketItemLink | null;
}

/**
 * Edits an existing transaction — reverses whatever it used to contribute
 * (old account/category/month, read fresh from the doc itself inside the
 * transaction, never trusted from the caller) and applies what the edited
 * fields contribute, netted into one write per document actually touched.
 * Mirrors functions/src/transactions.ts's onTransactionWrite
 * reverse-then-apply design (see that file's header for why diffing the
 * fields directly is the wrong, easy-to-get-subtly-wrong approach) — the
 * edit path createTransactionWithAggregation's own header said would be
 * needed once transaction editing existed.
 */
export async function updateTransactionWithAggregation(
  uid: string,
  input: UpdateTransactionInput,
  ctx: CurrencyContext
) {
  const db = getFirebaseFirestore();
  const newMonth = monthKey(input.date);
  const currentMonth = monthKey(new Date());
  const dateTimestamp = Timestamp.fromDate(input.date);
  const newSignedAmount = input.direction === 'Inflow' ? input.amount : -input.amount;

  let oldMonth = '';
  let oldCategoryId: string | null = null;
  let oldLink: BucketItemLink | null = null;

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transactionRef(uid, input.id));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transaction no longer exists.');
    assertCounted(before);
    oldLink = before.bucketItem ?? null;
    const oldAccountId = before.accountId;
    oldCategoryId = before.categoryId ?? null;
    oldMonth = before.month ?? monthKey(before.date.toDate());
    const oldSignedAmount = before.signedAmount ?? (before.direction === 'Inflow' ? before.amount : -before.amount);
    // Edit Transaction has no control for changing this classification —
    // whatever the doc already was, it stays (only amount/date/category/
    // account/description can move here).
    const isFrozenSavings = Boolean(before.isFrozenSavings);

    const accountIds = Array.from(new Set([oldAccountId, input.accountId]));
    const accountSnaps = new Map(
      await Promise.all(accountIds.map(async (id) => [id, await tx.get(accountRef(uid, id))] as const))
    );
    if (accountIds.some((id) => accountSnaps.get(id)?.data()?.frozen)) {
      throw new Error('One of these wallets is frozen, unfreeze it before editing this transaction.');
    }

    tx.update(transactionRef(uid, input.id), {
      date: dateTimestamp,
      type: input.type,
      description: input.description,
      accountId: input.accountId,
      categoryId: input.categoryId,
      amount: input.amount,
      direction: input.direction,
      signedAmount: newSignedAmount,
      month: newMonth,
      ...(input.bucketItem !== undefined ? { bucketItem: input.bucketItem } : {}),
      updatedAt: dateTimestamp,
    });

    // Account balances: a net delta per account touched — the same account
    // on both sides (the common case, just an amount/category/date edit)
    // nets to the plain difference; different accounts (the transaction
    // moved wallets) each get their own directed delta. A frozen-savings
    // entry never touched currentBalance in the first place (see
    // writeTransactionContribution) — it moves lockedAmount instead, on
    // both the reversal and the reapplied side.
    const accountDeltas = new Map<string, number>();
    const lockedDeltas = new Map<string, number>();
    if (isFrozenSavings) {
      lockedDeltas.set(oldAccountId, (lockedDeltas.get(oldAccountId) ?? 0) - Math.abs(oldSignedAmount));
      lockedDeltas.set(input.accountId, (lockedDeltas.get(input.accountId) ?? 0) + Math.abs(newSignedAmount));
    } else {
      accountDeltas.set(oldAccountId, (accountDeltas.get(oldAccountId) ?? 0) - oldSignedAmount);
      accountDeltas.set(input.accountId, (accountDeltas.get(input.accountId) ?? 0) + newSignedAmount);
    }
    for (const [accId, delta] of lockedDeltas) {
      if (delta !== 0) tx.update(accountRef(uid, accId), { lockedAmount: increment(delta) });
    }
    for (const [accId, delta] of accountDeltas) {
      assertNotBelowLocked(accountSnaps.get(accId)?.data(), delta);
      if (delta !== 0) tx.update(accountRef(uid, accId), { currentBalance: increment(delta) });
    }

    // Converted-to-base amounts for stats*, using each side's own account's
    // native currency. Each contribution below carries its own signed
    // incomeDelta/expenseDelta rather than one signed `convertedDelta` later
    // re-classified by sign (positive = income, negative = expense) — that
    // used to be how this worked, and it's wrong for the OLD/reversal side:
    // negating a $100 income's contribution and re-classifying the result
    // reads as a NEW $100 expense, not "$100 less income", so totalIncome
    // AND totalExpense both silently inflated by the same amount on every
    // single edit, even a no-op one that changed no numbers at all (two
    // equal-and-opposite convertedDeltas landing in the same statsMonthly
    // month never cancelled out, since one got bucketed as income and the
    // other as expense instead of netting to zero). Computing each side's
    // own incomeDelta/expenseDelta up front — negative for the reversal,
    // positive for the new contribution — means a no-op edit's two
    // contributions actually do cancel to exactly zero.
    const oldCurrency = accountSnaps.get(oldAccountId)?.data()?.currency ?? ctx.base;
    const newCurrency = accountSnaps.get(input.accountId)?.data()?.currency ?? ctx.base;
    const oldAmountBase = convert(oldSignedAmount, oldCurrency, ctx.base, ctx.rates);
    const newAmountBase = convert(newSignedAmount, newCurrency, ctx.base, ctx.rates);

    type Contribution = { month: string; categoryId: string | null; type: string; incomeDelta: number; expenseDelta: number; countDelta: number };
    const contributions: Contribution[] = [
      // Reverse what this transaction originally contributed.
      {
        month: oldMonth,
        categoryId: oldCategoryId,
        type: before.type,
        incomeDelta: oldAmountBase > 0 ? -oldAmountBase : 0,
        expenseDelta: oldAmountBase < 0 ? oldAmountBase : 0,
        countDelta: -1,
      },
      // Apply what the edited fields contribute.
      {
        month: newMonth,
        categoryId: input.categoryId,
        type: input.type,
        incomeDelta: newAmountBase > 0 ? newAmountBase : 0,
        expenseDelta: newAmountBase < 0 ? -newAmountBase : 0,
        countDelta: 1,
      },
    ];

    // One combined statsMonthly write per distinct month touched (usually
    // just one, when the edit didn't move the transaction to a different
    // month) — both contributions are summed in plain JS first rather than
    // issuing two separate increment() writes to the same field, so there's
    // no question about how multiple transform ops to one field combine
    // within a single transaction.
    const monthGroups = new Map<string, Contribution[]>();
    for (const c of contributions) {
      if (!monthGroups.has(c.month)) monthGroups.set(c.month, []);
      monthGroups.get(c.month)!.push(c);
    }
    for (const [month, group] of monthGroups) {
      let totalIncomeDelta = 0;
      let totalExpenseDelta = 0;
      let countDelta = 0;
      const spendByCategory = new Map<string, number>();
      const countByCategory = new Map<string, number>();
      for (const c of group) {
        totalIncomeDelta += c.incomeDelta;
        totalExpenseDelta += c.expenseDelta;
        countDelta += c.countDelta;
        if (c.categoryId) {
          // perCategorySpend's convention (see writeTransactionContribution):
          // positive = progress toward budget. For an Expense category that's
          // net spend (expenseDelta - incomeDelta); for an Income category
          // it's net received, the opposite sign (incomeDelta - expenseDelta).
          const delta = c.type === 'Income' ? c.incomeDelta - c.expenseDelta : c.expenseDelta - c.incomeDelta;
          spendByCategory.set(c.categoryId, (spendByCategory.get(c.categoryId) ?? 0) + delta);
          countByCategory.set(c.categoryId, (countByCategory.get(c.categoryId) ?? 0) + c.countDelta);
        }
      }
      const monthUpdate: Record<string, unknown> = {
        totalIncome: increment(totalIncomeDelta),
        totalExpense: increment(totalExpenseDelta),
        transactionCount: increment(countDelta),
        lastUpdated: serverTimestamp(),
      };
      if (spendByCategory.size > 0) {
        monthUpdate.perCategorySpend = Object.fromEntries(
          [...spendByCategory].map(([catId, delta]) => [catId, increment(delta)])
        );
        monthUpdate.perCategoryCount = Object.fromEntries(
          [...countByCategory].map(([catId, delta]) => [catId, increment(delta)])
        );
      }
      tx.set(statsMonthlyRef(uid, month), monthUpdate, { merge: true });
    }

    // stats-home: totalBalanceBase always moves by both sides combined;
    // thisMonthIncome/Expense only for whichever side(s) land in the
    // current month (an edit into/out of the current month should still
    // move it correctly either way).
    const homeUpdate: Record<string, unknown> = {
      totalBalanceBase: increment(isFrozenSavings ? 0 : newAmountBase - oldAmountBase),
      lastUpdated: serverTimestamp(),
    };
    let thisMonthIncomeDelta = 0;
    let thisMonthExpenseDelta = 0;
    for (const c of contributions) {
      if (c.month !== currentMonth) continue;
      thisMonthIncomeDelta += c.incomeDelta;
      thisMonthExpenseDelta += c.expenseDelta;
    }
    if (thisMonthIncomeDelta !== 0 || thisMonthExpenseDelta !== 0) {
      homeUpdate.thisMonthIncome = increment(thisMonthIncomeDelta);
      homeUpdate.thisMonthExpense = increment(thisMonthExpenseDelta);
    }
    tx.set(statsHomeRef(uid), homeUpdate, { merge: true });
  });

  const newLink = input.bucketItem === undefined ? oldLink : input.bucketItem;
  if (oldLink && !sameLink(oldLink, newLink)) {
    await syncLinkedItemPayment(uid, oldLink, input.id, 'expense', null);
  }
  if (newLink) {
    await syncLinkedItemPayment(uid, newLink, input.id, 'expense', { amount: input.amount, date: input.date });
  }


}

/**
 * Deletes a transaction and reverses everything it contributed — the same
 * account/stats math updateTransactionWithAggregation's "old" (reversal)
 * side already uses, just without an "apply the new one" half. Never a bare
 * deleteDoc: without reversing currentBalance first, the wallet's stored
 * balance would stay permanently too high (or too low, for a reversed
 * expense) by this transaction's amount, exactly the kind of drift
 * src/shared/firestore/reconciliation.ts's audit exists to catch — this is
 * the write-side fix so that drift never happens in the first place.
 */
export async function deleteTransactionWithAggregation(uid: string, transactionId: string, ctx: CurrencyContext) {
  const db = getFirebaseFirestore();
  const currentMonth = monthKey(new Date());

  let categoryId: string | null = null;
  let month = '';
  let link: BucketItemLink | null = null;

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transactionRef(uid, transactionId));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transaction no longer exists.');
    assertCounted(before);
    link = before.bucketItem ?? null;
    const accountId = before.accountId;
    categoryId = before.categoryId ?? null;
    month = before.month ?? monthKey(before.date.toDate());
    const signedAmount = before.signedAmount ?? (before.direction === 'Inflow' ? before.amount : -before.amount);

    const accountSnap = await tx.get(accountRef(uid, accountId));
    const accountData = accountSnap.data();
    if (accountData?.frozen) {
      throw new Error('This wallet is frozen, unfreeze it before deleting this transaction.');
    }

    tx.delete(transactionRef(uid, transactionId));
    if (before.isFrozenSavings) {
      // Never touched currentBalance to begin with (see
      // writeTransactionContribution) — reverse the lockedAmount it added
      // instead.
      tx.update(accountRef(uid, accountId), { lockedAmount: increment(-Math.abs(signedAmount)) });
    } else {
      // Deleting an inflow (positive signedAmount) removes money from the
      // account (delta = -signedAmount, negative) — the same "would this
      // dip below what's locked" check every other outflow-shaped delta
      // gets. Deleting an outflow only ever gives money back, never needs
      // the check.
      assertNotBelowLocked(accountData, -signedAmount);
      tx.update(accountRef(uid, accountId), { currentBalance: increment(-signedAmount) });
    }

    const nativeCurrency = accountData?.currency ?? ctx.base;
    // The amount this transaction originally contributed, reversed — same
    // incomeDelta/expenseDelta shape updateTransactionWithAggregation's
    // reversal side uses (see its own comment on why re-classifying a
    // single negated signed number by sign is the wrong, bug-prone shape).
    const amountBase = convert(signedAmount, nativeCurrency, ctx.base, ctx.rates);
    const incomeDelta = amountBase > 0 ? -amountBase : 0;
    const expenseDelta = amountBase < 0 ? amountBase : 0;

    const monthUpdate: Record<string, unknown> = {
      totalIncome: increment(incomeDelta),
      totalExpense: increment(expenseDelta),
      transactionCount: increment(-1),
      lastUpdated: serverTimestamp(),
    };
    if (categoryId) {
      // Same Income-vs-Expense sign convention as writeTransactionContribution.
      monthUpdate.perCategorySpend = {
        [categoryId]: increment(before.type === 'Income' ? incomeDelta - expenseDelta : expenseDelta - incomeDelta),
      };
      monthUpdate.perCategoryCount = { [categoryId]: increment(-1) };
    }
    tx.set(statsMonthlyRef(uid, month), monthUpdate, { merge: true });

    const homeUpdate: Record<string, unknown> = {
      totalBalanceBase: increment(before.isFrozenSavings ? 0 : -amountBase),
      lastUpdated: serverTimestamp(),
    };
    if (month === currentMonth) {
      homeUpdate.thisMonthIncome = increment(incomeDelta);
      homeUpdate.thisMonthExpense = increment(expenseDelta);
    }
    tx.set(statsHomeRef(uid), homeUpdate, { merge: true });
  });

  if (link) await syncLinkedItemPayment(uid, link, transactionId, 'expense', null);
}

/**
 * PRD-AUDIT-RECONCILIATION.md section 1.4 — "Delete batch" removes every
 * transaction sharing one backfillBatchId, reversing each one's effect on
 * currentBalance/stats* the same way deleting any single transaction
 * already does (deleteTransactionWithAggregation above), just looped
 * across the batch. Sequential, not Promise.all, for the same reason
 * importRow (src/logic/importCsv/useLogic.ts) imports one row at a time —
 * a dozen concurrent writes to the same account/statsMonthly/stats-home
 * docs would just contend with each other.
 */
export async function deleteBackfillBatch(uid: string, batchId: string, ctx: CurrencyContext): Promise<void> {
  const transactionsSnap = await getDocs(query(transactionsRef(uid), where('backfillBatchId', '==', batchId)));
  for (const doc of transactionsSnap.docs) {
    await deleteTransactionWithAggregation(uid, doc.id, ctx);
  }
  const transfersSnap = await getDocs(query(transfersRef(uid), where('backfillBatchId', '==', batchId)));
  for (const doc of transfersSnap.docs) {
    await deleteTransferWithAggregation(uid, doc.id);
  }
}

/**
 * PRD-AUDIT-RECONCILIATION.md section 2.1/2.3 — "explaining" a historic
 * expense the ledger never recorded. The real wallet's *reported* balance
 * already reflects that this money left the account (that's exactly what
 * made up part of the gap), so recording a plain expense against it would
 * double-count the drop. Instead: first move `amount` INTO the real wallet
 * FROM the Unjustified wallet (acknowledging "this money really was there,
 * the ledger just never knew it"), then record the expense against that
 * same wallet — the two operations net to zero on the real wallet's
 * balance, while the Unjustified wallet's balance drops by `amount`,
 * shrinking the unexplained gap. Both the transfer and the expense happen
 * in one runTransaction so they can never land only half-done.
 *
 * Deliberately NOT built on createTransferWithAggregation: that function's
 * assertNotBelowLocked would misfire here — the Unjustified wallet has no
 * `lockedAmount` concept and is explicitly allowed to swing to either sign
 * (section 2.6), unlike every real wallet's "never below zero unless
 * something is locked" assumption.
 */
export async function recordTransactionExplainingUnjustifiedBalance(
  input: CreateTransactionInput & { transferId: string },
  ctx: CurrencyContext
): Promise<void> {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();
  const dateTimestamp = Timestamp.fromDate(input.date);

  await runTransaction(db, async (tx) => {
    const accountSnap = await tx.get(accountRef(uid, input.accountId));
    const accountData = accountSnap.data();

    // 1. Transfer `amount` from the Unjustified wallet into the real one —
    // a credit to the real wallet, so its own locked-amount floor (which
    // only ever blocks an outflow) never applies here.
    tx.set(transferRef(uid, input.transferId), {
      date: dateTimestamp,
      description: `Reconciliation: ${input.description}`,
      fromAccountId: UNJUSTIFIED_WALLET_ID,
      toAccountId: input.accountId,
      amount: input.amount,
      charges: 0,
      kind: 'Wallet to wallet',
      notes: '',
      createdBy: uid,
      createdAt: dateTimestamp,
    });
    tx.update(unjustifiedWalletRef(uid), { currentBalance: increment(-input.amount) });
    tx.update(accountRef(uid, input.accountId), { currentBalance: increment(input.amount) });

    // 2. The actual expense against that same real wallet — same
    // frozen/locked checks, same stats* math, every other expense gets.
    writeTransactionContribution(tx, uid, { ...input, isUnjustifiedAdjustment: true }, accountData, ctx);
  });

}

/**
 * The mirror image of the function above — an unrecorded INCOME. The
 * income is recorded against the real wallet first (same as any income),
 * then that same amount is transferred out of the real wallet and into the
 * Unjustified wallet, moving its balance back toward zero from the other
 * direction.
 */
export async function recordIncomeExplainingUnjustifiedBalance(
  input: CreateTransactionInput & { transferId: string },
  ctx: CurrencyContext
): Promise<void> {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();
  const dateTimestamp = Timestamp.fromDate(input.date);

  await runTransaction(db, async (tx) => {
    const accountSnap = await tx.get(accountRef(uid, input.accountId));
    const accountData = accountSnap.data();

    // 1. The income itself, against the real wallet — same as any income.
    writeTransactionContribution(tx, uid, { ...input, isUnjustifiedAdjustment: true }, accountData, ctx);

    // 2. Transfer that same amount back out of the real wallet and into
    // the Unjustified wallet. No assertNotBelowLocked here — unlike an
    // ordinary outflow, this one exactly cancels the income step above
    // (the real wallet's balance nets to zero change overall), so it can
    // never actually erode anything already locked; checking against
    // accountData's pre-write currentBalance would (wrongly) evaluate the
    // outflow as if the income had never landed first.
    tx.set(transferRef(uid, input.transferId), {
      date: dateTimestamp,
      description: `Reconciliation: ${input.description}`,
      fromAccountId: input.accountId,
      toAccountId: UNJUSTIFIED_WALLET_ID,
      amount: input.amount,
      charges: 0,
      kind: 'Wallet to wallet',
      notes: '',
      createdBy: uid,
      createdAt: dateTimestamp,
    });
    tx.update(accountRef(uid, input.accountId), { currentBalance: increment(-input.amount) });
    tx.update(unjustifiedWalletRef(uid), { currentBalance: increment(input.amount) });
  });

}

export interface CreateTransferInput {
  id: string;
  date: Date;
  description: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  // What the transfer cost — a wire fee, mobile-money charge, etc. Debited
  // from fromAccountId on top of `amount`; toAccountId only ever receives
  // `amount`. Defaults to 0 for a free transfer.
  charges?: number;
  kind: string;
  createdBy: string;
  // Set only by commitBackfillSpread (src/shared/firestore/unaccountedBalance.ts)
  // for a recurring transfer spread across a range of past months — see
  // CreateTransactionInput's own isHistoricBackfill for the matching
  // transaction-side convention; every other caller leaves these undefined.
  isHistoricBackfill?: boolean;
  backfillBatchId?: string | null;
  bucketItem?: BucketItemLink | null;
}

/**
 * Writes a new transfer and moves both accounts' currentBalance — the same
 * scope onTransferWrite had (native currency only, never touches stats*'s
 * income/expense/balance totals, see that file's own comment on the
 * cross-currency-transfer limitation this inherits unchanged). It does
 * update perCategorySpend/perCategoryCount for `input.kind` though (a
 * TRANSFER_CATEGORIES value, e.g. "Wallet to savings") — the same map a
 * transaction's categoryId writes into — so a Transfer-type budget rule
 * (FirestoreBudgetRule.type, categoryId = that same kind string) can track
 * "planned vs. actually moved" the same way an Expense/Income/Savings rule
 * tracks "budgeted vs. spent" (src/logic/budget/useLogic.ts's `categories`
 * computation is already generic over categoryId, no changes needed there).
 * `input.createdBy` doubles as the uid whose subcollections this writes to.
 */
/**
 * The write half of createTransferWithAggregation — factored out the same
 * way writeTransactionContribution is, so a write that must create a real
 * transfer alongside its own doc (src/shared/firestore/bucketBudget.ts's
 * savings-funded allocation) can do both in one runTransaction(). Both
 * account snaps must already have been read.
 */
export function writeTransferContribution(
  tx: import('firebase/firestore').Transaction,
  uid: string,
  input: CreateTransferInput,
  fromData: { frozen?: boolean; lockedAmount?: number; currentBalance?: number } | undefined,
  toData: { frozen?: boolean } | undefined
): void {
  const month = monthKey(input.date);
  const dateTimestamp = Timestamp.fromDate(input.date);
  const charges = input.charges ?? 0;
  if (fromData?.frozen || toData?.frozen) {
    throw new Error('One of these wallets is frozen, unfreeze it before transferring.');
  }
  // Only fromAccountId is ever debited (below) — toAccountId only
  // receives, so it never needs the locked-amount check.
  assertNotBelowLocked(fromData, -(input.amount + charges));

  tx.set(transferRef(uid, input.id), {
    date: dateTimestamp,
    description: input.description,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: input.amount,
    charges,
    kind: input.kind,
    notes: '',
    createdBy: input.createdBy,
    createdAt: dateTimestamp,
    ...(input.isHistoricBackfill ? { isHistoricBackfill: true, backfillBatchId: input.backfillBatchId ?? null } : {}),
    bucketItem: input.bucketItem ?? null,
  });
  // fromAccountId pays the transfer amount AND the charges; toAccountId
  // only ever receives the transfer amount itself.
  tx.update(accountRef(uid, input.fromAccountId), { currentBalance: increment(-(input.amount + charges)) });
  tx.update(accountRef(uid, input.toAccountId), { currentBalance: increment(input.amount) });

  tx.set(
    statsMonthlyRef(uid, month),
    {
      perCategorySpend: { [input.kind]: increment(input.amount) },
      perCategoryCount: { [input.kind]: increment(1) },
      lastUpdated: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createTransferWithAggregation(input: CreateTransferInput) {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();

  await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, input.fromAccountId)),
      tx.get(accountRef(uid, input.toAccountId)),
    ]);
    writeTransferContribution(tx, uid, input, fromSnap.data(), toSnap.data());
  });

  if (input.bucketItem) {
    await syncLinkedItemPayment(uid, input.bucketItem, input.id, 'transfer', { amount: input.amount, date: input.date });
  }
}

export interface UpdateTransferInput {
  id: string;
  date: Date;
  description: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  charges?: number;
  kind: string;
  bucketItem?: BucketItemLink | null; // undefined leaves the existing link alone
}

/**
 * Edits an existing transfer — reverses whatever it used to move (old
 * from/to accounts, amount, charges, kind, and month, read fresh from the
 * doc itself inside the transaction, never trusted from the caller) and
 * applies what the edited fields move, netted into one balance write per
 * account actually touched and one statsMonthly write per month touched.
 * Same reverse-then-apply shape as updateTransactionWithAggregation, scoped
 * to what createTransferWithAggregation itself touches — account balances
 * and perCategorySpend/perCategoryCount only, never stats-home's
 * income/expense/balance totals (see that function's own header for why).
 */
export async function updateTransferWithAggregation(uid: string, input: UpdateTransferInput): Promise<void> {
  const db = getFirebaseFirestore();
  const newMonth = monthKey(input.date);
  const dateTimestamp = Timestamp.fromDate(input.date);
  const newCharges = input.charges ?? 0;

  let oldKind = '';
  let oldMonth = '';
  let oldLink: BucketItemLink | null = null;

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transferRef(uid, input.id));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transfer no longer exists.');
    oldLink = before.bucketItem ?? null;
    oldKind = before.kind;
    oldMonth = monthKey(before.date.toDate());
    const oldCharges = before.charges ?? 0;

    const accountIds = Array.from(
      new Set([before.fromAccountId, before.toAccountId, input.fromAccountId, input.toAccountId])
    );
    const accountSnaps = new Map(
      await Promise.all(accountIds.map(async (id) => [id, await tx.get(accountRef(uid, id))] as const))
    );
    if (accountIds.some((id) => accountSnaps.get(id)?.data()?.frozen)) {
      throw new Error('One of these wallets is frozen, unfreeze it before editing this transfer.');
    }

    tx.update(transferRef(uid, input.id), {
      date: dateTimestamp,
      description: input.description,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      charges: newCharges,
      kind: input.kind,
      ...(input.bucketItem !== undefined ? { bucketItem: input.bucketItem } : {}),
      updatedAt: dateTimestamp,
    });

    // Account balances: reverse the old transfer's effect, then apply the
    // new one — the same account can land on both sides of this (a
    // same-account amount/date/kind-only edit, or the from/to pair swapped),
    // so every delta is netted per account before any write, same as
    // updateTransactionWithAggregation's own accountDeltas map.
    const accountDeltas = new Map<string, number>();
    accountDeltas.set(before.fromAccountId, (accountDeltas.get(before.fromAccountId) ?? 0) + before.amount + oldCharges);
    accountDeltas.set(before.toAccountId, (accountDeltas.get(before.toAccountId) ?? 0) - before.amount);
    accountDeltas.set(
      input.fromAccountId,
      (accountDeltas.get(input.fromAccountId) ?? 0) - (input.amount + newCharges)
    );
    accountDeltas.set(input.toAccountId, (accountDeltas.get(input.toAccountId) ?? 0) + input.amount);
    for (const [accId, delta] of accountDeltas) {
      assertNotBelowLocked(accountSnaps.get(accId)?.data(), delta);
    }
    for (const [accId, delta] of accountDeltas) {
      if (delta !== 0) tx.update(accountRef(uid, accId), { currentBalance: increment(delta) });
    }

    // perCategorySpend/perCategoryCount, keyed by kind (see
    // createTransferWithAggregation) — reverse the old kind's contribution
    // and apply the new one, both contributions summed in plain JS per
    // month first (old and new kind can differ, and can land in the same
    // month) rather than issuing separate increment() writes to the same
    // statsMonthly doc within one transaction.
    type Contribution = { month: string; kind: string; spendDelta: number; countDelta: number };
    const contributions: Contribution[] = [
      { month: oldMonth, kind: oldKind, spendDelta: -before.amount, countDelta: -1 },
      { month: newMonth, kind: input.kind, spendDelta: input.amount, countDelta: 1 },
    ];
    const monthGroups = new Map<string, Contribution[]>();
    for (const c of contributions) {
      if (!monthGroups.has(c.month)) monthGroups.set(c.month, []);
      monthGroups.get(c.month)!.push(c);
    }
    for (const [month, group] of monthGroups) {
      const spendByKind = new Map<string, number>();
      const countByKind = new Map<string, number>();
      for (const c of group) {
        spendByKind.set(c.kind, (spendByKind.get(c.kind) ?? 0) + c.spendDelta);
        countByKind.set(c.kind, (countByKind.get(c.kind) ?? 0) + c.countDelta);
      }
      tx.set(
        statsMonthlyRef(uid, month),
        {
          perCategorySpend: Object.fromEntries([...spendByKind].map(([kind, delta]) => [kind, increment(delta)])),
          perCategoryCount: Object.fromEntries([...countByKind].map(([kind, delta]) => [kind, increment(delta)])),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  const newLink = input.bucketItem === undefined ? oldLink : input.bucketItem;
  if (oldLink && !sameLink(oldLink, newLink)) {
    await syncLinkedItemPayment(uid, oldLink, input.id, 'transfer', null);
  }
  if (newLink) {
    await syncLinkedItemPayment(uid, newLink, input.id, 'transfer', { amount: input.amount, date: input.date });
  }
}

/**
 * Deletes a transfer and reverses everything it contributed — the same
 * "reverse, then delete" shape deleteTransactionWithAggregation uses, just
 * for the two-account, no-income/expense effect createTransferWithAggregation
 * has. Never a bare deleteDoc, for the same reason: without reversing both
 * accounts' currentBalance first, one would stay permanently too high and
 * the other too low by this transfer's amount.
 */
export async function deleteTransferWithAggregation(uid: string, transferId: string): Promise<void> {
  const db = getFirebaseFirestore();
  let link: BucketItemLink | null = null;

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transferRef(uid, transferId));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transfer no longer exists.');
    link = before.bucketItem ?? null;
    const month = monthKey(before.date.toDate());
    const charges = before.charges ?? 0;

    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, before.fromAccountId)),
      tx.get(accountRef(uid, before.toAccountId)),
    ]);
    const fromData = fromSnap.data();
    const toData = toSnap.data();
    if (fromData?.frozen || toData?.frozen) {
      throw new Error('One of these wallets is frozen, unfreeze it before deleting this transfer.');
    }
    // Reversing toAccountId's credit is a real outflow from its balance
    // (money leaving), so it gets the same "would this dip below what's
    // locked" check any other outflow gets. Reversing fromAccountId's debit
    // only ever gives money back, never needs the check.
    assertNotBelowLocked(toData, -before.amount);

    tx.delete(transferRef(uid, transferId));
    tx.update(accountRef(uid, before.fromAccountId), { currentBalance: increment(before.amount + charges) });
    tx.update(accountRef(uid, before.toAccountId), { currentBalance: increment(-before.amount) });

    tx.set(
      statsMonthlyRef(uid, month),
      {
        perCategorySpend: { [before.kind]: increment(-before.amount) },
        perCategoryCount: { [before.kind]: increment(-1) },
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  });

  if (link) await syncLinkedItemPayment(uid, link, transferId, 'transfer', null);
}

// ---------------------------------------------------------------------
// Buckets — `PRD Files/prd debt n goals` section 1.
// ---------------------------------------------------------------------

export interface CreateBucketInput {
  name: string;
  description: string;
  deadline: Date | null;
  currency: string;
  kind: 'Fixed' | 'Variable';
  type: 'Expense' | 'Income' | 'Savings' | 'Transfer';
}

export async function createBucket(uid: string, input: CreateBucketInput): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(bucketRef(uid, id), {
    name: input.name,
    description: input.description,
    totalAmount: 0,
    lineItemCount: 0,
    completedLineItemCount: 0,
    amountCompleted: 0,
    currency: input.currency,
    deadline: input.deadline ? Timestamp.fromDate(input.deadline) : null,
    archived: false,
    kind: input.kind,
    type: input.type,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function archiveBucket(uid: string, goalId: string): Promise<void> {
  await updateDoc(bucketRef(uid, goalId), { archived: true, updatedAt: serverTimestamp() });
}

// Archiving a bucket never deletes it — Settings' own Archived buckets screen
// lists everything archived==true and can bring one back with this.
export async function restoreBucket(uid: string, goalId: string): Promise<void> {
  await updateDoc(bucketRef(uid, goalId), { archived: false, updatedAt: serverTimestamp() });
}

export interface UpdateBucketInput {
  name: string;
  description: string;
  deadline: Date | null;
  currency: string;
  kind: 'Fixed' | 'Variable';
  type: 'Expense' | 'Income' | 'Savings' | 'Transfer';
}

/**
 * Bucket-level fields only — totalAmount/lineItemCount/etc. stay owned by
 * recalcBucketTotals. `kind`/`type` are editable here same as every other
 * field on the edit form — changing either one only affects which
 * categories/recurrence options new line items see going forward; any
 * line item already created keeps its own categoryId/recurrence exactly as
 * it was, even if that no longer matches the bucket's new kind/type.
 */
export async function updateBucket(uid: string, goalId: string, input: UpdateBucketInput): Promise<void> {
  await updateDoc(bucketRef(uid, goalId), {
    name: input.name,
    description: input.description,
    deadline: input.deadline ? Timestamp.fromDate(input.deadline) : null,
    currency: input.currency,
    kind: input.kind,
    type: input.type,
    updatedAt: serverTimestamp(),
  });
}

/**
 * PRD-BUDGETS-V2.md section 9 — a bucket item that real money was recorded
 * against (a linked transaction/transfer) or that budget was moved into or
 * out of (an allocation) can't be deleted: its spend would silently fall
 * back to "unplanned" and its funding trail would point at nothing.
 * Archiving the bucket keeps both intact. The scope is one item, or every
 * item of one bucket.
 */
async function assertNothingLinked(uid: string, scope: { itemId: string } | { bucketId: string }) {
  const [field, value] = 'itemId' in scope ? ['itemId', scope.itemId] : ['bucketId', scope.bucketId];
  const [transactionsSnap, transfersSnap, fromSnap, toSnap] = await Promise.all([
    getDocs(query(transactionsRef(uid), where(`bucketItem.${field}`, '==', value), limit(1))),
    getDocs(query(transfersRef(uid), where(`bucketItem.${field}`, '==', value), limit(1))),
    getDocs(query(allocationsRef(uid), where(`from.${field}`, '==', value), limit(1))),
    getDocs(query(allocationsRef(uid), where(`to.${field}`, '==', value), limit(1))),
  ]);
  if (!transactionsSnap.empty || !transfersSnap.empty) {
    throw new Error('Payments are linked to this, unlink them first, or archive the bucket instead.');
  }
  if (!fromSnap.empty || !toSnap.empty) {
    throw new Error('Budget was moved into or out of this, undo those moves first, or archive the bucket instead.');
  }
}

// Permanently removes a bucket and every one of its line items — unlike
// archiveBucket (which only flips archived: true so Settings' own Archived
// buckets screen can always bring it back), this leaves no record behind and
// can't be undone. Refused while anything is still linked to its items (see
// assertNothingLinked).
export async function deleteBucket(uid: string, goalId: string): Promise<void> {
  await assertNothingLinked(uid, { bucketId: goalId });
  const itemsSnap = await getDocs(bucketLineItemsRef(uid, goalId));
  const batch = writeBatch(getFirebaseFirestore());
  for (const docSnap of itemsSnap.docs) {
    batch.delete(docSnap.ref);
  }
  batch.delete(bucketRef(uid, goalId));
  await batch.commit();
}

/**
 * Recomputes a bucket's denormalized totalAmount/lineItemCount/
 * completedLineItemCount/amountCompleted from its real lineItems
 * subcollection — recomputed right after rather than inside the write's
 * own runTransaction(), since that needs a query and a Transaction.get()
 * only ever accepts a single DocumentReference. Called after every
 * lineItems write.
 */
// Exported so a caller outside this file can force a recompute — used by
// src/logic/bucketDetail/useLogic.ts's actualAmount backfill effect, which
// patches a line item's own actualAmount directly (not through one of this
// file's own recordBucketLineItemPayment/etc. writes, which already call this
// themselves) and would otherwise leave the bucket's own amountCompleted
// stale against the now-corrected line item.
export async function recalcBucketTotals(uid: string, goalId: string) {
  const snap = await getDocs(bucketLineItemsRef(uid, goalId));
  const lineItems = snap.docs.map((d) => d.data());
  const totalAmount = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const completed = lineItems.filter((li) => li.completed);
  await updateDoc(bucketRef(uid, goalId), {
    totalAmount,
    lineItemCount: lineItems.length,
    completedLineItemCount: completed.length,
    // Actual spend, not the plan — a completed item's actualAmount (what
    // the Mark Complete form actually recorded) reflects real money moved,
    // which is very often more or less than what was budgeted; falls back
    // to `amount` only for an item completed before actualAmount existed.
    amountCompleted: completed.reduce((sum, li) => sum + (Number(li.actualAmount ?? li.amount) || 0), 0),
    updatedAt: serverTimestamp(),
  });
}

export interface CreateBucketLineItemInput {
  name: string;
  description: string;
  amount: number;
  priority: Priority;
  necessity: BucketItemNecessity;
  // For a Transfer bucket, a TRANSFER_CATEGORIES kind string rather than a
  // real categories/{id} — see FirestoreBucketLineItem.categoryId's header.
  categoryId: string;
  // The category's own transactionType — the caller (bucketDetail/useLogic.ts)
  // already has this from its own categoryTransactionType map, so this
  // avoids a second category read here just to tag a Fixed bucket's
  // auto-created budget rule (or a later addBucketLineItemToBudget call)
  // with the right BudgetLineType.
  categoryType: BudgetLineType;
  // The FROM account for a Transfer bucket's item, same field for every
  // other bucket type.
  accountId: string | null;
  // Transfer bucket items only.
  toAccountId?: string | null;
  charges?: number | null;
  dueDate: Date | null;
  // Fixed-bucket items only — see FirestoreBucketLineItem.recurrence's header.
  recurrence?: { frequency: Frequency; interval: number } | null;
  // The item's own shopping-list checklist, edited as a batch alongside
  // every other field on this same form (see FirestoreBucketLineItem
  // .subItems's header) — ticking one off afterward from Bucket Detail goes
  // through toggleBucketLineItemSubItem instead, not this.
  subItems?: BucketLineItemSubItem[];
}

/**
 * A bucket line item is a DEDICATION of future spend, not a budget plan — it
 * never touches FirestoreBudgetRule (that stays the household's own direct,
 * manually-entered "estimated basket" per category/month, PRD-BUDGET's
 * original mechanism). Used to be that a Fixed bucket's item auto-created its
 * own recurring budget rule right here, silently inflating that category's
 * planned amount the moment the item was created; that's exactly the
 * double-accounting this app now avoids. Instead, once this item is later
 * completed (recordBucketLineItemPayment), the real transaction it records
 * shows up in the Budget screen's per-category breakdown as "dedicated"
 * spend — tied to a bucket — versus "unplanned" for everything else, so both
 * budgeting methods (a direct per-category estimate, and a bucket's own line
 * items) reconcile against the same real spend instead of each claiming
 * their own separate planned figure. A Fixed item's `recurrence` is kept
 * purely for its own due-date scheduling (Payments Calendar/Home's upcoming
 * payments read it directly off the item, see upcomingPayments.ts) — it no
 * longer drives any budget rule.
 */
export async function createBucketLineItem(
  uid: string,
  goalId: string,
  bucketKind: 'Fixed' | 'Variable',
  input: CreateBucketLineItemInput
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(bucketLineItemRef(uid, goalId, id), {
    goalId,
    name: input.name,
    description: input.description,
    amount: input.amount,
    priority: input.priority,
    necessity: input.necessity,
    categoryId: input.categoryId,
    accountId: input.accountId,
    toAccountId: input.toAccountId ?? null,
    charges: input.charges ?? null,
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
    recurrence: bucketKind === 'Fixed' ? (input.recurrence ?? null) : null,
    subItems: input.subItems ?? [],
    // A new item always lands at the end of the cross-bucket to-do list's
    // custom order — Date.now() is always greater than any earlier item's
    // rank without needing to read the whole list first to find a max.
    rank: Date.now(),
    completed: false,
    completedAt: null,
    expenseId: null,
    transferId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recalcBucketTotals(uid, goalId);
  return id;
}

/**
 * Bulk-sets rank on line items possibly spanning several buckets — the
 * cross-bucket "All bucket items" list's reordering (both a manual up/down swap
 * and "use this order" after sorting by priority/ease). One batch so a
 * multi-item reorder can never apply half its writes.
 */
export async function setBucketLineItemRanks(
  uid: string,
  items: { goalId: string; lineItemId: string; rank: number }[]
): Promise<void> {
  const db = getFirebaseFirestore();
  const batch = writeBatch(db);
  for (const item of items) {
    batch.update(bucketLineItemRef(uid, item.goalId, item.lineItemId), { rank: item.rank, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

/**
 * Editing a line item never touches a budget rule any more — see
 * createBucketLineItem's own header for why. A pre-existing item from before
 * this change may still carry a `budgetRuleId` from back when one was
 * auto-created for it; that old rule is left exactly as it is (now just an
 * ordinary manually-editable budget line as far as the Budget screen is
 * concerned) rather than kept in sync with edits made here.
 */
export async function updateBucketLineItem(
  uid: string,
  goalId: string,
  lineItemId: string,
  input: CreateBucketLineItemInput
): Promise<void> {
  // The edit form only knows frequency/interval — keep an existing
  // recurrence.endDate (set by scripts/migrate-budgets-v2.ts for a rule that
  // had an end condition) instead of silently making the item repeat forever.
  const existingEndDate = (await getDoc(bucketLineItemRef(uid, goalId, lineItemId))).data()?.recurrence?.endDate ?? null;
  const recurrence = input.recurrence ? { ...input.recurrence, endDate: existingEndDate } : null;
  await updateDoc(bucketLineItemRef(uid, goalId, lineItemId), {
    name: input.name,
    description: input.description,
    amount: input.amount,
    priority: input.priority,
    necessity: input.necessity,
    categoryId: input.categoryId,
    accountId: input.accountId,
    toAccountId: input.toAccountId ?? null,
    charges: input.charges ?? null,
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
    recurrence,
    subItems: input.subItems ?? [],
    updatedAt: serverTimestamp(),
  });
  await recalcBucketTotals(uid, goalId);
}

// Adding/removing a sub-item happens as part of this same form's batched
// Save (CreateBucketLineItemInput.subItems above, via createBucketLineItem/
// updateBucketLineItem) — this is only for ticking one off live from Bucket
// Detail's own line item row, without opening the edit form. A plain
// read-modify-write on the embedded array (see FirestoreBucketLineItem
// .subItems's header); never touches money/balances/budget, so no
// transaction, and never calls recalcBucketTotals since a line item's own
// `amount` (what that sums) never changes here.
export async function toggleBucketLineItemSubItem(
  uid: string,
  goalId: string,
  lineItemId: string,
  subItemId: string
): Promise<void> {
  const ref = bucketLineItemRef(uid, goalId, lineItemId);
  const snap = await getDoc(ref);
  const current = (snap.data()?.subItems ?? []) as BucketLineItemSubItem[];
  const next = current.map((subItem) =>
    subItem.id === subItemId ? { ...subItem, completed: !subItem.completed } : subItem
  );
  await updateDoc(ref, { subItems: next, updatedAt: serverTimestamp() });
}

/** Refused while anything is still linked to the item (assertNothingLinked). */
export async function deleteBucketLineItem(uid: string, goalId: string, lineItemId: string): Promise<void> {
  await assertNothingLinked(uid, { itemId: lineItemId });
  await deleteDoc(bucketLineItemRef(uid, goalId, lineItemId));
  await recalcBucketTotals(uid, goalId);
}

export interface MarkBucketLineItemCompleteInput {
  accountId: string;
  categoryId: string | null;
  date: Date;
  description: string;
  // The completed item's own category transactionType — an Expense-category
  // item spends out of accountId (Outflow); a Savings-category item credits
  // accountId, which the bucket form already restricts to a real Savings
  // Account wallet (viewmodels/wallets.ts's SAVINGS_ACCOUNT_TYPE), so this
  // is a deposit into it (Inflow), not a frozen-lock like Add Transaction's
  // "frozen savings" mode; an Income-category item also credits accountId
  // (Inflow) — the expected income actually arriving. 'Transfer' takes the
  // separate branch below entirely (accountId is the FROM side, see
  // toAccountId/charges). Defaults to 'Expense' — the only behavior this
  // function had before Savings/Income/Transfer bucket items existed.
  categoryType?: 'Expense' | 'Savings' | 'Income' | 'Transfer';
  // Transfer bucket items only — the account the amount lands in, and the
  // planned cost of moving it (mirrors createTransferWithAggregation's own
  // CreateTransferInput).
  toAccountId?: string | null;
  charges?: number | null;
  // PRD-BUDGETS-V2.md section 4.3 — which month's occurrence of this item
  // the payment settles (yyyy-MM). Defaults to the payment date's own month;
  // differs for an early/late payment (September's rent paid Aug 30).
  occurrenceMonth?: string;
  // Income items only — see FirestoreTransaction.incomeSubtype.
  incomeSubtype?: IncomeSubtype | null;
}

/**
 * Recording a payment against a line item writes a real Expense, Income, or
 * Savings transaction (via writeTransactionContribution, the same write
 * createTransactionWithAggregation uses) and appends it to the item's own
 * `payments` — both inside one runTransaction() so a payment can never end
 * up recorded on the item without the transaction actually existing, or
 * vice versa. `fullyPaid` decides whether this closes the item
 * (`completed: true`, same as this function's old always-complete
 * behavior) or leaves it open as "partial" — some real money recorded, but
 * more payments still expected — for an expense that isn't settled in one
 * shot. `paymentAmount` is this ONE payment's amount, not necessarily the
 * item's full planned `amount`.
 *
 * A Transfer bucket's item takes a wholly different branch: it moves money
 * between two of the household's own accounts (categoryId here is a
 * TRANSFER_CATEGORIES kind string, not a real category) rather than
 * spending/receiving against one, so it records a real transfer the same
 * way createTransferWithAggregation does — just inlined into this same
 * transaction so a payment can't end up recorded without the transfer
 * existing either.
 */
export async function recordBucketLineItemPayment(
  uid: string,
  goalId: string,
  lineItemId: string,
  paymentAmount: number,
  fullyPaid: boolean,
  input: MarkBucketLineItemCompleteInput,
  ctx: CurrencyContext
): Promise<void> {
  const db = getFirebaseFirestore();
  const clientId = crypto.randomUUID();
  const categoryType = input.categoryType ?? 'Expense';
  const bucketItem: BucketItemLink = {
    bucketId: goalId,
    itemId: lineItemId,
    month: input.occurrenceMonth ?? monthKey(input.date),
  };

  if (categoryType === 'Transfer') {
    if (!input.toAccountId) throw new Error('Choose which account this transfer moves money into.');
    const toAccountId = input.toAccountId;
    const charges = input.charges ?? 0;
    const dateTimestamp = Timestamp.fromDate(input.date);
    const kind = input.categoryId ?? 'Wallet to wallet';

    await runTransaction(db, async (tx) => {
      const [fromSnap, toSnap, lineItemSnap, bucketSnap] = await Promise.all([
        tx.get(accountRef(uid, input.accountId)),
        tx.get(accountRef(uid, toAccountId)),
        tx.get(bucketLineItemRef(uid, goalId, lineItemId)),
        tx.get(bucketRef(uid, goalId)),
      ]);
      // A Fixed item recurs — paying one month's occurrence never closes
      // the item itself (that used to hide it from every later month).
      // Per-month status is derived instead (src/shared/budget/monthBudget.ts).
      const closes = fullyPaid && bucketSnap.data()?.kind !== 'Fixed';
      if (fromSnap.data()?.frozen || toSnap.data()?.frozen) {
        throw new Error('One of these wallets is frozen, unfreeze it before transferring.');
      }
      assertNotBelowLocked(fromSnap.data(), -(paymentAmount + charges));

      tx.set(transferRef(uid, clientId), {
        date: dateTimestamp,
        description: input.description,
        fromAccountId: input.accountId,
        toAccountId,
        amount: paymentAmount,
        charges,
        kind,
        notes: '',
        bucketItem,
        createdBy: uid,
        createdAt: dateTimestamp,
      });
      tx.update(accountRef(uid, input.accountId), { currentBalance: increment(-(paymentAmount + charges)) });
      tx.update(accountRef(uid, toAccountId), { currentBalance: increment(paymentAmount) });
      tx.set(
        statsMonthlyRef(uid, monthKey(input.date)),
        {
          perCategorySpend: { [kind]: increment(paymentAmount) },
          perCategoryCount: { [kind]: increment(1) },
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      const payments = [
        ...(lineItemSnap.data()?.payments ?? []),
        { id: clientId, kind: 'transfer' as const, amount: paymentAmount, date: dateTimestamp },
      ];
      tx.update(bucketLineItemRef(uid, goalId, lineItemId), {
        completed: closes,
        completedAt: closes ? serverTimestamp() : null,
        transferId: clientId,
        payments,
        actualAmount: round2(payments.reduce((sum, payment) => sum + payment.amount, 0)),
        updatedAt: serverTimestamp(),
      });
    });

    await recalcBucketTotals(uid, goalId);
    return;
  }

  const direction = categoryType === 'Expense' ? 'Outflow' : 'Inflow';

  await runTransaction(db, async (tx) => {
    const [accountSnap, lineItemSnap, bucketSnap] = await Promise.all([
      tx.get(accountRef(uid, input.accountId)),
      tx.get(bucketLineItemRef(uid, goalId, lineItemId)),
      tx.get(bucketRef(uid, goalId)),
    ]);
    const closes = fullyPaid && bucketSnap.data()?.kind !== 'Fixed';
    writeTransactionContribution(
      tx,
      uid,
      {
        id: clientId,
        date: input.date,
        type: categoryType,
        description: input.description,
        accountId: input.accountId,
        categoryId: input.categoryId,
        amount: paymentAmount,
        direction,
        createdBy: uid,
        bucketItem,
        incomeSubtype: categoryType === 'Income' ? (input.incomeSubtype ?? null) : null,
      },
      accountSnap.data(),
      ctx
    );
    const payments = [
      ...(lineItemSnap.data()?.payments ?? []),
      { id: clientId, kind: 'expense' as const, amount: paymentAmount, date: Timestamp.fromDate(input.date) },
    ];
    tx.update(bucketLineItemRef(uid, goalId, lineItemId), {
      completed: closes,
      completedAt: closes ? serverTimestamp() : null,
      expenseId: clientId,
      payments,
      actualAmount: round2(payments.reduce((sum, payment) => sum + payment.amount, 0)),
      updatedAt: serverTimestamp(),
    });
  });

  await recalcBucketTotals(uid, goalId);
}

// ---------------------------------------------------------------------
// Debt — `PRD Files/prd debt n goals` section 2. Switching a debt's wallet
// effect and editing what moves money live in debtWrites.ts.
// ---------------------------------------------------------------------

export interface CreateDebtInput {
  name: string;
  description: string;
  debtType: DebtType;
  // The wallet a 'cash' debt's borrowed money lands in — required for
  // 'cash', so the principal can actually be credited there (see below) and
  // every later repayment has a real default to debit. Not asked for an
  // 'existing' (record only) debt: the money never passed through an account.
  accountId: string | null;
  principalAmount: number;
  currency: string;
  priority: DebtPriority;
  startDate: Date;
  notes: string;
  lender?: string;
  recurring?: {
    amount: number;
    interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
    nextPaymentDate: Date;
    paidFrom?: DebtPaidFrom | null;
    automation?: 'off' | 'remind' | 'prepare';
  } | null;
  // The "Loan received" income credit, when it comes from recording debt
  // financing as income (Add Transaction): its id, category and the
  // income line it's received against.
  credit?: { transactionId?: string; categoryId?: string | null; description?: string; bucketItem?: BucketItemLink | null } | null;
}

export async function createDebt(uid: string, input: CreateDebtInput, ctx: CurrencyContext): Promise<string> {
  const id = crypto.randomUUID();
  const paymentPlan: FirestoreDebtPaymentPlan = input.recurring
    ? {
        type: 'recurring',
        recurring: {
          amount: input.recurring.amount,
          interval: input.recurring.interval,
          nextPaymentDate: Timestamp.fromDate(input.recurring.nextPaymentDate),
          isActive: true,
          paidFrom: input.recurring.paidFrom ?? null,
          automation: input.recurring.automation ?? 'off',
          nextOverride: null,
        },
      }
    : { type: 'none' };
  const isCash = input.debtType === 'cash' && Boolean(input.accountId);
  const borrowingTransactionId = isCash ? (input.credit?.transactionId ?? crypto.randomUUID()) : null;
  const debtFields = {
    name: input.name,
    description: input.description,
    debtType: input.debtType,
    accountId: input.accountId,
    principalAmount: input.principalAmount,
    currentBalance: input.principalAmount,
    totalRepaid: 0,
    currency: input.currency,
    priority: input.priority,
    startDate: Timestamp.fromDate(input.startDate),
    paymentPlan,
    notes: input.notes,
    lender: input.lender ?? '',
    borrowingTransactionId,
    lastChangeId: null,
    paidOffAt: null,
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // A 'cash' debt's borrowed money always lands in the wallet it's linked
  // to — credited here as a real Inflow transaction, inside the same
  // transaction as the debt doc itself, so the two can never diverge (the
  // debt would never exist with its principal missing from the wallet, or
  // vice versa).
  const db = getFirebaseFirestore();
  await runTransaction(db, async (tx) => {
    const accountSnap = isCash ? await tx.get(accountRef(uid, input.accountId!)) : null;
    if (isCash && borrowingTransactionId) {
      writeTransactionContribution(
        tx,
        uid,
        {
          id: borrowingTransactionId,
          date: input.startDate,
          type: 'Income',
          description: input.credit?.description || `Loan received: ${input.name}`,
          accountId: input.accountId!,
          categoryId: input.credit?.categoryId ?? null,
          amount: input.principalAmount,
          direction: 'Inflow',
          createdBy: uid,
          // Borrowed money is income for its month, as debt financing,
          // linked to the debt that tracks paying it back.
          incomeSubtype: 'debt_financing',
          linkedDebtId: id,
          bucketItem: input.credit?.bucketItem ?? null,
        },
        accountSnap!.data(),
        ctx
      );
    }
    tx.set(debtRef(uid, id), debtFields);
    writeDebtActivity(tx, uid, id, {
      kind: 'created',
      title: 'Debt created',
      lines: [isCash ? `Received into ${accountSnap!.data()?.name ?? 'an account'}, counted as income for its month (borrowed).` : 'Record only: your balances didn\u2019t change.'],
    });
  });

  return id;
}

export function addInterval(date: Date, interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly'): Date {
  const d = new Date(date);
  if (interval === 'weekly') d.setDate(d.getDate() + 7);
  else if (interval === 'biweekly') d.setDate(d.getDate() + 14);
  else if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d;
}

export interface RecordRepaymentInput {
  amount: number;
  date: Date;
  notes: string;
  method: 'manual' | 'planned';
  // Required for a 'cash' debt (money has to leave a real account); for an
  // 'existing' debt this is the optional "paid from one of my accounts"
  // toggle — null skips creating a transaction entirely, just logs progress.
  accountId: string | null;
  categoryId: string | null;
  // The form refuses a repayment the account can't cover; Import doesn't
  // (historic rows against imperfect balances).
  checkFunds?: boolean;
}

export interface RepaymentDebt {
  id: string;
  name: string;
  debtType: DebtType;
  principalAmount: number;
  paymentPlan: FirestoreDebtPaymentPlan;
}

/**
 * Records a repayment against a debt, all in one runTransaction(): the
 * repayment doc, for a 'cash' debt (or a record-only one paid from an
 * account) a real Expense transaction via writeTransactionContribution, the
 * debt's totalRepaid/currentBalance recomputed from every repayment, the
 * plan's next payment moved on, and an activity entry.
 */
export async function recordRepayment(
  uid: string,
  debt: RepaymentDebt,
  input: RecordRepaymentInput,
  ctx: CurrencyContext
): Promise<string> {
  const db = getFirebaseFirestore();
  const repaymentId = crypto.randomUUID();
  const shouldLinkTransaction = debt.debtType === 'cash' || Boolean(input.accountId);
  if (shouldLinkTransaction && !input.accountId) {
    throw new Error('Choose an account to debit for this repayment.');
  }
  // A transaction can't query: list the existing repayments first, then
  // read each one inside it.
  const existingIds = (await getDocs(repaymentsRef(uid, debt.id))).docs.map((d) => d.id);

  await runTransaction(db, async (tx) => {
    const debtSnap = await tx.get(debtRef(uid, debt.id));
    const current = debtSnap.data();
    if (!current) throw new Error('This debt no longer exists.');
    const repaymentSnaps = await Promise.all(existingIds.map((id) => tx.get(repaymentRef(uid, debt.id, id))));
    const accountSnap = shouldLinkTransaction ? await tx.get(accountRef(uid, input.accountId!)) : null;
    const account = accountSnap?.data();
    if (input.checkFunds && account) {
      const available = round2((account.currentBalance ?? 0) - (account.lockedAmount ?? 0));
      if (available < input.amount) {
        throw new Error(`${account.name} doesn\u2019t have enough money for this (${Math.round(available).toLocaleString('en-US')} available).`);
      }
    }

    let transactionId: string | null = null;
    if (shouldLinkTransaction) {
      transactionId = crypto.randomUUID();
      writeTransactionContribution(
        tx,
        uid,
        {
          id: transactionId,
          date: input.date,
          type: 'Expense',
          description: `Repayment: ${current.name}`,
          accountId: input.accountId!,
          categoryId: input.categoryId,
          amount: input.amount,
          direction: 'Outflow',
          createdBy: uid,
          isDebtRepayment: true,
          linkedDebtId: debt.id,
        },
        account,
        ctx
      );
    }
    tx.set(repaymentRef(uid, debt.id, repaymentId), {
      debtId: debt.id,
      amount: input.amount,
      date: Timestamp.fromDate(input.date),
      method: input.method,
      notes: input.notes,
      transactionId,
      createdAt: serverTimestamp(),
    });

    const totalRepaid = round2(repaymentSnaps.reduce((sum, snap) => sum + (Number(snap.data()?.amount) || 0), 0) + input.amount);
    const currentBalance = Math.max(0, round2(current.principalAmount - totalRepaid));
    let paymentPlan = current.paymentPlan;
    const recurring = paymentPlan.type === 'recurring' ? paymentPlan.recurring : undefined;
    if (recurring?.isActive) {
      // A planned payment moves the schedule on from its own date; a
      // manual one from the day it was paid. A one-off "next payment"
      // override is used up either way.
      const from = recurring.nextOverride ? recurring.nextPaymentDate.toDate() : input.method === 'planned' ? recurring.nextPaymentDate.toDate() : input.date;
      paymentPlan = {
        ...paymentPlan,
        recurring: {
          ...recurring,
          nextPaymentDate: Timestamp.fromDate(recurring.nextOverride ? from : addInterval(from, recurring.interval)),
          nextOverride: null,
          isActive: currentBalance > 0,
        },
      };
    }
    tx.update(debtRef(uid, debt.id), {
      totalRepaid,
      currentBalance,
      paymentPlan,
      paidOffAt: currentBalance <= 0 ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
    writeDebtActivity(tx, uid, debt.id, {
      kind: 'repayment',
      title: currentBalance <= 0 ? 'Paid off' : 'Repayment recorded',
      changes: [{ label: 'Balance owed', from: fmt(current.currentBalance), to: fmt(currentBalance) }],
      lines: [account ? `${fmt(input.amount)} from ${account.name}.` : `${fmt(input.amount)}, not from your accounts.`],
    });
  });

  return repaymentId;
}

/**
 * Links an already-recorded transaction to a bucket item's occurrence (or
 * unlinks it with `null`) — the Planning History tab's "Assign to bucket".
 * Everything else about the transaction stays as it is; the same update
 * path as editing it keeps balances, stats and the item's payments right.
 */
export async function assignTransactionToItem(
  uid: string,
  transaction: FirestoreTransaction,
  link: BucketItemLink | null,
  ctx: CurrencyContext
): Promise<void> {
  await updateTransactionWithAggregation(
    uid,
    {
      id: transaction.id,
      date: transaction.date.toDate(),
      type: transaction.type,
      description: transaction.description,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      direction: transaction.direction,
      bucketItem: link,
    },
    ctx
  );
}
