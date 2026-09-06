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
// create/delete a transfer, create/edit-amount/archive a budget rule.
// updateTransactionWithAggregation/deleteTransactionWithAggregation and
// deleteTransferWithAggregation are the reverse-(then-apply) paths (see
// their own doc comments) — everything else here only ever applies a new
// contribution, never has to reverse an old one. There is still no edit UI
// for a transfer's own fields (amount, accounts, ...) — only delete.

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
  deleteField,
  writeBatch,
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
  statsBudgetProgressRef,
  budgetRulesRef,
  budgetRuleRef,
  goalRef,
  goalLineItemsRef,
  goalLineItemRef,
  debtRef,
  repaymentsRef,
  repaymentRef,
  UNJUSTIFIED_WALLET_ID,
  unjustifiedWalletRef,
} from './refs';
import { convert, round2, type CurrencyContext } from './currency';
import { toRecurrenceRule } from './recurrence';
import { ruleAppliesToMonth, effectiveBudgetedAmount } from '@dreda/shared-recurrence';
import type { FirestoreDebtPaymentPlan, DebtType, DebtPriority, BudgetLineType, Priority, GoalItemNecessity } from './types';

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
    throw new Error('This would dip into the amount locked in this wallet — unlock some of it first, or use a smaller amount.');
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
}

/**
 * The write half of "record a transaction" — account currentBalance,
 * statsMonthly, stats-home, the same fields onTransactionWrite's
 * applyDelta() used to maintain via a trigger — factored out so
 * markGoalLineItemComplete and recordRepaymentWithAggregation (both of
 * which also need to write a real transaction, inside their OWN
 * runTransaction() alongside a goal/debt write) can reuse the exact same
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
    throw new Error('This wallet is frozen — unfreeze it before recording a transaction against it.');
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

  if (input.categoryId) {
    const month = monthKey(input.date);
    await ensureBudgetCoverageForCategoryMonth(uid, input.categoryId, month, input.type as BudgetLineType);
    await recomputeBudgetProgressForCategoryMonth(uid, input.categoryId, month);
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

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transactionRef(uid, input.id));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transaction no longer exists.');
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
      throw new Error('One of these wallets is frozen — unfreeze it before editing this transaction.');
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

  if (input.categoryId) {
    await ensureBudgetCoverageForCategoryMonth(uid, input.categoryId, newMonth, input.type as BudgetLineType);
  }

  const pairs = new Map<string, { categoryId: string; month: string }>();
  if (oldCategoryId) pairs.set(`${oldCategoryId}::${oldMonth}`, { categoryId: oldCategoryId, month: oldMonth });
  if (input.categoryId) {
    pairs.set(`${input.categoryId}::${newMonth}`, { categoryId: input.categoryId, month: newMonth });
  }
  await Promise.all(
    [...pairs.values()].map(({ categoryId, month }) => recomputeBudgetProgressForCategoryMonth(uid, categoryId, month))
  );
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

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transactionRef(uid, transactionId));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transaction no longer exists.');
    const accountId = before.accountId;
    categoryId = before.categoryId ?? null;
    month = before.month ?? monthKey(before.date.toDate());
    const signedAmount = before.signedAmount ?? (before.direction === 'Inflow' ? before.amount : -before.amount);

    const accountSnap = await tx.get(accountRef(uid, accountId));
    const accountData = accountSnap.data();
    if (accountData?.frozen) {
      throw new Error('This wallet is frozen — unfreeze it before deleting this transaction.');
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

  if (categoryId) {
    await recomputeBudgetProgressForCategoryMonth(uid, categoryId, month);
  }
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

  if (input.categoryId) {
    await recomputeBudgetProgressForCategoryMonth(uid, input.categoryId, monthKey(input.date));
  }
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

  if (input.categoryId) {
    await recomputeBudgetProgressForCategoryMonth(uid, input.categoryId, monthKey(input.date));
  }
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
export async function createTransferWithAggregation(input: CreateTransferInput) {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();
  const month = monthKey(input.date);
  const dateTimestamp = Timestamp.fromDate(input.date);
  const charges = input.charges ?? 0;

  await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, input.fromAccountId)),
      tx.get(accountRef(uid, input.toAccountId)),
    ]);
    if (fromSnap.data()?.frozen || toSnap.data()?.frozen) {
      throw new Error('One of these wallets is frozen — unfreeze it before transferring.');
    }
    // Only fromAccountId is ever debited (below) — toAccountId only
    // receives, so it never needs the locked-amount check.
    assertNotBelowLocked(fromSnap.data(), -(input.amount + charges));

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
  });

  await recomputeBudgetProgressForCategoryMonth(uid, input.kind, month);
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
  let kind = '';
  let month = '';

  await runTransaction(db, async (tx) => {
    const beforeSnap = await tx.get(transferRef(uid, transferId));
    const before = beforeSnap.data();
    if (!before) throw new Error('This transfer no longer exists.');
    kind = before.kind;
    month = monthKey(before.date.toDate());
    const charges = before.charges ?? 0;

    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, before.fromAccountId)),
      tx.get(accountRef(uid, before.toAccountId)),
    ]);
    const fromData = fromSnap.data();
    const toData = toSnap.data();
    if (fromData?.frozen || toData?.frozen) {
      throw new Error('One of these wallets is frozen — unfreeze it before deleting this transfer.');
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

  await recomputeBudgetProgressForCategoryMonth(uid, kind, month);
}

/**
 * Every transaction registers to its own month's budget, even when
 * unbudgeted — if `categoryId` has no active rule covering `month`, this
 * creates a one-month, zero-budgeted rule for it (frequency 'Once',
 * anchored to that month) so the category still shows up as a line in that
 * month's Budget view (0 budgeted, whatever it actually spent) instead of
 * being invisible there. Called right before recomputeBudgetProgressForCategoryMonth
 * so a rule created here is immediately picked up by that recompute, same
 * "query outside a transaction, write after" shape every other budget
 * recompute in this file already uses.
 */
async function ensureBudgetCoverageForCategoryMonth(
  uid: string,
  categoryId: string,
  month: string,
  type: BudgetLineType
) {
  const [year, monthNum] = month.split('-').map(Number);
  const rulesSnap = await getDocs(
    query(budgetRulesRef(uid), where('categoryId', '==', categoryId), where('archived', '==', false))
  );
  const covered = rulesSnap.docs.some((ruleDoc) => {
    const rule = ruleDoc.data();
    const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year, monthNum);
    return occurrence && !rule.excludedMonths?.includes(month);
  });
  if (covered) return;

  await setDoc(budgetRuleRef(uid, crypto.randomUUID()), {
    categoryId,
    type,
    description: '',
    budgetedAmount: 0,
    frequency: 'Once',
    interval: 1,
    anchorDate: Timestamp.fromDate(new Date(year, monthNum - 1, 1)),
    endCondition: 'Never',
    endOccurrences: null,
    endDate: null,
    accountId: null,
    tag: null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Recomputes statsBudgetProgress/{month} for every active rule covering
 * `categoryId` — mirrors functions/src/lib/budgetProgress.ts's
 * recomputeRulesForCategory, called after a transaction changes that
 * category's spend for `month` (which may be any month, not just the
 * current one).
 */
async function recomputeBudgetProgressForCategoryMonth(uid: string, categoryId: string, month: string) {
  const [rulesSnap, monthlySnap] = await Promise.all([
    getDocs(query(budgetRulesRef(uid), where('categoryId', '==', categoryId), where('archived', '==', false))),
    getDoc(statsMonthlyRef(uid, month)),
  ]);
  const perCategorySpend = monthlySnap.data()?.perCategorySpend ?? {};
  const perCategoryCount = monthlySnap.data()?.perCategoryCount ?? {};
  const [year, monthNum] = month.split('-').map(Number);

  const progress: Record<string, unknown> = {};
  for (const ruleDoc of rulesSnap.docs) {
    const rule = ruleDoc.data();
    const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year, monthNum);
    if (!occurrence || rule.excludedMonths?.includes(month)) {
      progress[ruleDoc.id] = deleteField();
      continue;
    }
    const budgeted = effectiveBudgetedAmount(Number(rule.budgetedAmount) || 0, occurrence.multiplier, rule.monthOverrides, month);
    const spent = perCategorySpend[categoryId] ?? 0;
    const count = perCategoryCount[categoryId] ?? 0;
    progress[ruleDoc.id] = { budgeted, spent, remaining: budgeted - spent, count };
  }
  if (Object.keys(progress).length > 0) {
    await setDoc(statsBudgetProgressRef(uid, month), progress, { merge: true });
  }
}

/**
 * Recomputes exactly one rule's entry in one specific month's
 * statsBudgetProgress doc — mirrors functions/src/budgetRules.ts's
 * onBudgetRuleWrite. Takes an explicit month rather than assuming "now" so
 * a rule newly anchored into a past month (a retrospective budget) can have
 * that past month's snapshot populated too, and so a "this month only"
 * amount override (rule.monthOverrides) can refresh just the one month it
 * targets — see recomputeBudgetProgressForRuleCurrentMonth below for the
 * current-month convenience wrapper most callers still want.
 */
export async function recomputeBudgetProgressForRuleAndMonth(uid: string, ruleId: string, month: string): Promise<void> {
  const ruleSnap = await getDoc(budgetRuleRef(uid, ruleId));
  const rule = ruleSnap.data();

  if (!rule || rule.archived || !rule.categoryId) {
    await setDoc(statsBudgetProgressRef(uid, month), { [ruleId]: deleteField() }, { merge: true });
    return;
  }

  const [year, monthNum] = month.split('-').map(Number);
  const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year, monthNum);
  if (!occurrence || rule.excludedMonths?.includes(month)) {
    await setDoc(statsBudgetProgressRef(uid, month), { [ruleId]: deleteField() }, { merge: true });
    return;
  }

  const monthlySnap = await getDoc(statsMonthlyRef(uid, month));
  const spent = monthlySnap.data()?.perCategorySpend?.[rule.categoryId] ?? 0;
  const count = monthlySnap.data()?.perCategoryCount?.[rule.categoryId] ?? 0;
  const budgeted = effectiveBudgetedAmount(Number(rule.budgetedAmount) || 0, occurrence.multiplier, rule.monthOverrides, month);

  await setDoc(
    statsBudgetProgressRef(uid, month),
    { [ruleId]: { budgeted, spent, remaining: budgeted - spent, count } },
    { merge: true }
  );
}

/**
 * Deliberately current-month-only, same as the onBudgetRuleWrite trigger
 * this mirrors — a plain edit to a rule's own fields shouldn't rewrite
 * already-closed past months' snapshots. Retrospective-anchor creation and
 * "this month only" overrides both need a specific past month recomputed
 * too, and call recomputeBudgetProgressForRuleAndMonth directly for that.
 */
export async function recomputeBudgetProgressForRuleCurrentMonth(uid: string, ruleId: string): Promise<void> {
  await recomputeBudgetProgressForRuleAndMonth(uid, ruleId, monthKey(new Date()));
}

// ---------------------------------------------------------------------
// Goals — `PRD Files/prd debt n goals` section 1.
// ---------------------------------------------------------------------

export interface CreateGoalInput {
  name: string;
  description: string;
  deadline: Date | null;
  currency: string;
}

export async function createGoal(uid: string, input: CreateGoalInput): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(goalRef(uid, id), {
    name: input.name,
    description: input.description,
    totalAmount: 0,
    lineItemCount: 0,
    completedLineItemCount: 0,
    amountCompleted: 0,
    currency: input.currency,
    deadline: input.deadline ? Timestamp.fromDate(input.deadline) : null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function archiveGoal(uid: string, goalId: string): Promise<void> {
  await updateDoc(goalRef(uid, goalId), { archived: true, updatedAt: serverTimestamp() });
}

export interface UpdateGoalInput {
  name: string;
  description: string;
  deadline: Date | null;
  currency: string;
}

/** Goal-level fields only — totalAmount/lineItemCount/etc. stay owned by recalcGoalTotals. */
export async function updateGoal(uid: string, goalId: string, input: UpdateGoalInput): Promise<void> {
  await updateDoc(goalRef(uid, goalId), {
    name: input.name,
    description: input.description,
    deadline: input.deadline ? Timestamp.fromDate(input.deadline) : null,
    currency: input.currency,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Recomputes a goal's denormalized totalAmount/lineItemCount/
 * completedLineItemCount/amountCompleted from its real lineItems
 * subcollection — the same "needs a query, which a Firestore transaction
 * can't run, so recompute right after instead" shape
 * recomputeBudgetProgressForCategoryMonth above already uses (a
 * Transaction.get() only ever accepts a single DocumentReference, never a
 * Query — see that function's own header for the same constraint on
 * statsBudgetProgress). Called after every lineItems write.
 */
async function recalcGoalTotals(uid: string, goalId: string) {
  const snap = await getDocs(goalLineItemsRef(uid, goalId));
  const lineItems = snap.docs.map((d) => d.data());
  const totalAmount = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const completed = lineItems.filter((li) => li.completed);
  await updateDoc(goalRef(uid, goalId), {
    totalAmount,
    lineItemCount: lineItems.length,
    completedLineItemCount: completed.length,
    amountCompleted: completed.reduce((sum, li) => sum + (Number(li.amount) || 0), 0),
    updatedAt: serverTimestamp(),
  });
}

export interface CreateGoalLineItemInput {
  name: string;
  description: string;
  amount: number;
  priority: Priority;
  necessity: GoalItemNecessity;
}

export async function createGoalLineItem(uid: string, goalId: string, input: CreateGoalLineItemInput): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(goalLineItemRef(uid, goalId, id), {
    goalId,
    name: input.name,
    description: input.description,
    amount: input.amount,
    priority: input.priority,
    necessity: input.necessity,
    // A new item always lands at the end of the cross-goal to-do list's
    // custom order — Date.now() is always greater than any earlier item's
    // rank without needing to read the whole list first to find a max.
    rank: Date.now(),
    completed: false,
    completedAt: null,
    expenseId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recalcGoalTotals(uid, goalId);
  return id;
}

/**
 * Bulk-sets rank on line items possibly spanning several goals — the
 * cross-goal "All goal items" list's reordering (both a manual up/down swap
 * and "use this order" after sorting by priority/ease). One batch so a
 * multi-item reorder can never apply half its writes.
 */
export async function setGoalLineItemRanks(
  uid: string,
  items: { goalId: string; lineItemId: string; rank: number }[]
): Promise<void> {
  const db = getFirebaseFirestore();
  const batch = writeBatch(db);
  for (const item of items) {
    batch.update(goalLineItemRef(uid, item.goalId, item.lineItemId), { rank: item.rank, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

export async function updateGoalLineItem(
  uid: string,
  goalId: string,
  lineItemId: string,
  input: CreateGoalLineItemInput
): Promise<void> {
  await updateDoc(goalLineItemRef(uid, goalId, lineItemId), {
    name: input.name,
    description: input.description,
    amount: input.amount,
    priority: input.priority,
    necessity: input.necessity,
    updatedAt: serverTimestamp(),
  });
  await recalcGoalTotals(uid, goalId);
}

/** Only a not-yet-completed line item — deleting one that already paid for
 * something real would silently orphan the reasoning behind that expense. */
export async function deleteGoalLineItem(uid: string, goalId: string, lineItemId: string): Promise<void> {
  await deleteDoc(goalLineItemRef(uid, goalId, lineItemId));
  await recalcGoalTotals(uid, goalId);
}

export interface MarkGoalLineItemCompleteInput {
  accountId: string;
  categoryId: string | null;
  date: Date;
  description: string;
}

/**
 * Marking a line item complete records a real Expense transaction (via
 * writeTransactionContribution, the same write createTransactionWithAggregation
 * uses) and links the two — both inside one runTransaction() so a line item
 * can never end up "complete" without the expense actually existing, or
 * vice versa. The line item's own `amount` is what gets spent; there's no
 * separate amount to type in here.
 */
export async function markGoalLineItemComplete(
  uid: string,
  goalId: string,
  lineItemId: string,
  lineItemAmount: number,
  input: MarkGoalLineItemCompleteInput,
  ctx: CurrencyContext
): Promise<void> {
  const db = getFirebaseFirestore();
  const clientId = crypto.randomUUID();

  await runTransaction(db, async (tx) => {
    const accountSnap = await tx.get(accountRef(uid, input.accountId));
    writeTransactionContribution(
      tx,
      uid,
      {
        id: clientId,
        date: input.date,
        type: 'Expense',
        description: input.description,
        accountId: input.accountId,
        categoryId: input.categoryId,
        amount: lineItemAmount,
        direction: 'Outflow',
        createdBy: uid,
      },
      accountSnap.data(),
      ctx
    );
    tx.update(goalLineItemRef(uid, goalId, lineItemId), {
      completed: true,
      completedAt: serverTimestamp(),
      expenseId: clientId,
      updatedAt: serverTimestamp(),
    });
  });

  if (input.categoryId) {
    const month = monthKey(input.date);
    await ensureBudgetCoverageForCategoryMonth(uid, input.categoryId, month, 'Expense');
    await recomputeBudgetProgressForCategoryMonth(uid, input.categoryId, month);
  }
  await recalcGoalTotals(uid, goalId);
}

// ---------------------------------------------------------------------
// Debt — `PRD Files/prd debt n goals` section 2.
// ---------------------------------------------------------------------

export interface CreateDebtInput {
  name: string;
  description: string;
  debtType: DebtType;
  // The wallet a 'cash' debt's borrowed money lands in — required for
  // 'cash', so the principal can actually be credited there (see below) and
  // every later repayment has a real default to debit. Not asked for an
  // 'existing' debt at creation (that type has no wallet impact unless
  // linked per-repayment).
  accountId: string | null;
  principalAmount: number;
  currency: string;
  priority: DebtPriority;
  startDate: Date;
  notes: string;
  recurring?: {
    amount: number;
    interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
    nextPaymentDate: Date;
  } | null;
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
        },
      }
    : { type: 'none' };
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
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // A 'cash' debt's borrowed money always lands in the wallet it's linked
  // to — credited here as a real Inflow transaction, inside the same
  // transaction as the debt doc itself, so the two can never diverge (the
  // debt would never exist with its principal missing from the wallet, or
  // vice versa).
  if (input.debtType === 'cash' && input.accountId) {
    const db = getFirebaseFirestore();
    const accountId = input.accountId;
    await runTransaction(db, async (tx) => {
      const accountSnap = await tx.get(accountRef(uid, accountId));
      writeTransactionContribution(
        tx,
        uid,
        {
          id: crypto.randomUUID(),
          date: input.startDate,
          type: 'Income',
          description: `Loan received: ${input.name}`,
          accountId,
          categoryId: null,
          amount: input.principalAmount,
          direction: 'Inflow',
          createdBy: uid,
        },
        accountSnap.data(),
        ctx
      );
      tx.set(debtRef(uid, id), debtFields);
    });
  } else {
    await setDoc(debtRef(uid, id), debtFields);
  }

  return id;
}

export async function archiveDebt(uid: string, debtId: string): Promise<void> {
  await updateDoc(debtRef(uid, debtId), { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export interface UpdateDebtInput {
  name: string;
  description: string;
  accountId: string | null;
  principalAmount: number;
  priority: DebtPriority;
  startDate: Date;
  notes: string;
}

/**
 * Edits a debt's own fields. A 'cash' debt that never had a wallet linked
 * (created before this field existed, or the household skipped it) gets one
 * more chance here: choosing an account for the first time credits the
 * current principal into it, exactly like createDebt does at creation —
 * same reasoning, just a later moment. Only fires on that null-to-set
 * transition, never on swapping an already-linked account (that would
 * double-credit money that's already been recorded once).
 */
export async function updateDebt(
  uid: string,
  debtId: string,
  before: { debtType: DebtType; accountId: string | null; name: string; totalRepaid: number },
  input: UpdateDebtInput,
  ctx: CurrencyContext
): Promise<void> {
  const update = {
    name: input.name,
    description: input.description,
    accountId: input.accountId,
    principalAmount: input.principalAmount,
    currentBalance: Math.max(0, round2(input.principalAmount - before.totalRepaid)),
    priority: input.priority,
    startDate: Timestamp.fromDate(input.startDate),
    notes: input.notes,
    updatedAt: serverTimestamp(),
  };

  const backfillsAccount = before.debtType === 'cash' && !before.accountId && Boolean(input.accountId);

  if (backfillsAccount && input.accountId) {
    const db = getFirebaseFirestore();
    const accountId = input.accountId;
    await runTransaction(db, async (tx) => {
      const accountSnap = await tx.get(accountRef(uid, accountId));
      writeTransactionContribution(
        tx,
        uid,
        {
          id: crypto.randomUUID(),
          date: new Date(),
          type: 'Income',
          description: `Loan received: ${input.name}`,
          accountId,
          categoryId: null,
          amount: input.principalAmount,
          direction: 'Inflow',
          createdBy: uid,
        },
        accountSnap.data(),
        ctx
      );
      tx.update(debtRef(uid, debtId), update);
    });
  } else {
    await updateDoc(debtRef(uid, debtId), update);
  }
}

function addInterval(date: Date, interval: 'weekly' | 'biweekly' | 'monthly' | 'yearly'): Date {
  const d = new Date(date);
  if (interval === 'weekly') d.setDate(d.getDate() + 7);
  else if (interval === 'biweekly') d.setDate(d.getDate() + 14);
  else if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Same "recompute from the real subcollection, a transaction can't query"
 * shape as recalcGoalTotals above. */
async function recalcDebtBalance(uid: string, debtId: string, principalAmount: number) {
  const snap = await getDocs(repaymentsRef(uid, debtId));
  const totalRepaid = snap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
  await updateDoc(debtRef(uid, debtId), {
    totalRepaid,
    currentBalance: Math.max(0, principalAmount - totalRepaid),
    updatedAt: serverTimestamp(),
  });
}

export interface RecordRepaymentInput {
  amount: number;
  date: Date;
  notes: string;
  method: 'manual' | 'planned';
  // Required for a 'cash' debt (money has to leave a real account); for an
  // 'existing' debt this is the optional "link to account transaction"
  // toggle from the PRD's UI spec — null skips creating a transaction
  // entirely, just logs progress.
  accountId: string | null;
  categoryId: string | null;
}

export interface RepaymentDebt {
  id: string;
  name: string;
  debtType: DebtType;
  principalAmount: number;
  paymentPlan: FirestoreDebtPaymentPlan;
}

/**
 * Records a repayment against a debt. For a 'cash' debt (or an 'existing'
 * debt where the household chose to link an account), this also writes a
 * real Expense transaction — inside the same runTransaction() as the
 * repayment doc, via writeTransactionContribution, so the two can never
 * diverge. For an 'existing' debt with no account linked, only the
 * repayment doc is written; the debt's balance still moves, nothing in the
 * ledger does. Either way, currentBalance/totalRepaid are recomputed from
 * the full repayments history afterward (recalcDebtBalance), and an active
 * recurring plan's nextPaymentDate advances by one interval.
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

  if (shouldLinkTransaction) {
    if (!input.accountId) {
      throw new Error('Choose an account to debit for this repayment.');
    }
    const transactionId = crypto.randomUUID();
    await runTransaction(db, async (tx) => {
      const accountSnap = await tx.get(accountRef(uid, input.accountId!));
      writeTransactionContribution(
        tx,
        uid,
        {
          id: transactionId,
          date: input.date,
          type: 'Expense',
          description: `Repayment: ${debt.name}`,
          accountId: input.accountId!,
          categoryId: input.categoryId,
          amount: input.amount,
          direction: 'Outflow',
          createdBy: uid,
          isDebtRepayment: true,
          linkedDebtId: debt.id,
        },
        accountSnap.data(),
        ctx
      );
      tx.set(repaymentRef(uid, debt.id, repaymentId), {
        debtId: debt.id,
        amount: input.amount,
        date: Timestamp.fromDate(input.date),
        method: input.method,
        notes: input.notes,
        transactionId,
        createdAt: serverTimestamp(),
      });
    });
    if (input.categoryId) {
      const month = monthKey(input.date);
      await ensureBudgetCoverageForCategoryMonth(uid, input.categoryId, month, 'Expense');
      await recomputeBudgetProgressForCategoryMonth(uid, input.categoryId, month);
    }
  } else {
    await setDoc(repaymentRef(uid, debt.id, repaymentId), {
      debtId: debt.id,
      amount: input.amount,
      date: Timestamp.fromDate(input.date),
      method: input.method,
      notes: input.notes,
      transactionId: null,
      createdAt: serverTimestamp(),
    });
  }

  await recalcDebtBalance(uid, debt.id, debt.principalAmount);

  if (debt.paymentPlan.type === 'recurring' && debt.paymentPlan.recurring?.isActive) {
    const nextPaymentDate = addInterval(input.date, debt.paymentPlan.recurring.interval);
    await updateDoc(debtRef(uid, debt.id), {
      paymentPlan: { ...debt.paymentPlan, recurring: { ...debt.paymentPlan.recurring, nextPaymentDate: Timestamp.fromDate(nextPaymentDate) } },
    });
  }

  return repaymentId;
}
