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
// every setDoc/updateDoc call site in src/logic): create/edit a
// transaction, create a transfer, create/edit-amount/archive a budget
// rule. updateTransactionWithAggregation is the one reverse-then-apply
// path (see its own doc comment) — everything else here only ever applies
// a new contribution, never has to reverse an old one. There is still no
// edit/delete UI for transfers, or delete for transactions — extending
// either the same way, mirroring functions/src/transfers.ts /
// functions/src/transactions.ts, is what's still missing.

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
  transferRef,
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
} from './refs';
import { convert, round2, type CurrencyContext } from './currency';
import { toRecurrenceRule } from './recurrence';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
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
function writeTransactionContribution(
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
  assertNotBelowLocked(accountData, signedAmount);
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
    createdBy: input.createdBy,
    createdAt: dateTimestamp,
  });

  tx.update(accountRef(uid, input.accountId), { currentBalance: increment(signedAmount) });

  const monthUpdate: Record<string, unknown> = {
    totalIncome: increment(income),
    totalExpense: increment(expense),
    transactionCount: increment(1),
    lastUpdated: serverTimestamp(),
  };
  if (input.categoryId) {
    monthUpdate.perCategorySpend = { [input.categoryId]: increment(expense - income) };
    monthUpdate.perCategoryCount = { [input.categoryId]: increment(1) };
  }
  tx.set(statsMonthlyRef(uid, month), monthUpdate, { merge: true });

  const homeUpdate: Record<string, unknown> = {
    totalBalanceBase: increment(convertedDelta),
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
    // moved wallets) each get their own directed delta.
    const accountDeltas = new Map<string, number>();
    accountDeltas.set(oldAccountId, (accountDeltas.get(oldAccountId) ?? 0) - oldSignedAmount);
    accountDeltas.set(input.accountId, (accountDeltas.get(input.accountId) ?? 0) + newSignedAmount);
    for (const [accId, delta] of accountDeltas) {
      assertNotBelowLocked(accountSnaps.get(accId)?.data(), delta);
      if (delta !== 0) tx.update(accountRef(uid, accId), { currentBalance: increment(delta) });
    }

    // Converted-to-base deltas for stats*, using each side's own account's
    // native currency — reverse the old contribution, apply the new one.
    const oldCurrency = accountSnaps.get(oldAccountId)?.data()?.currency ?? ctx.base;
    const newCurrency = accountSnaps.get(input.accountId)?.data()?.currency ?? ctx.base;
    const oldConvertedDelta = convert(-oldSignedAmount, oldCurrency, ctx.base, ctx.rates);
    const newConvertedDelta = convert(newSignedAmount, newCurrency, ctx.base, ctx.rates);

    type Contribution = { month: string; categoryId: string | null; convertedDelta: number; countDelta: number };
    const contributions: Contribution[] = [
      { month: oldMonth, categoryId: oldCategoryId, convertedDelta: oldConvertedDelta, countDelta: -1 },
      { month: newMonth, categoryId: input.categoryId, convertedDelta: newConvertedDelta, countDelta: 1 },
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
        const income = c.convertedDelta > 0 ? c.convertedDelta : 0;
        const expense = c.convertedDelta < 0 ? -c.convertedDelta : 0;
        totalIncomeDelta += income;
        totalExpenseDelta += expense;
        countDelta += c.countDelta;
        if (c.categoryId) {
          spendByCategory.set(c.categoryId, (spendByCategory.get(c.categoryId) ?? 0) + (expense - income));
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

    // stats-home: totalBalanceBase always moves by both deltas combined;
    // thisMonthIncome/Expense only for whichever side(s) land in the
    // current month (an edit into/out of the current month should still
    // move it correctly either way).
    const homeUpdate: Record<string, unknown> = {
      totalBalanceBase: increment(oldConvertedDelta + newConvertedDelta),
      lastUpdated: serverTimestamp(),
    };
    let thisMonthIncomeDelta = 0;
    let thisMonthExpenseDelta = 0;
    for (const c of contributions) {
      if (c.month !== currentMonth) continue;
      thisMonthIncomeDelta += c.convertedDelta > 0 ? c.convertedDelta : 0;
      thisMonthExpenseDelta += c.convertedDelta < 0 ? -c.convertedDelta : 0;
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
    const budgeted = (Number(rule.budgetedAmount) || 0) * occurrence.multiplier;
    const spent = perCategorySpend[categoryId] ?? 0;
    const count = perCategoryCount[categoryId] ?? 0;
    progress[ruleDoc.id] = { budgeted, spent, remaining: budgeted - spent, count };
  }
  if (Object.keys(progress).length > 0) {
    await setDoc(statsBudgetProgressRef(uid, month), progress, { merge: true });
  }
}

/**
 * Recomputes exactly one rule's entry in the CURRENT month's
 * statsBudgetProgress doc — mirrors functions/src/budgetRules.ts's
 * onBudgetRuleWrite, called after a budget rule is created, its amount
 * edited, or it's archived. Deliberately current-month-only, same as the
 * trigger version (past months shouldn't get rewritten by a later rule
 * edit).
 */
export async function recomputeBudgetProgressForRuleCurrentMonth(uid: string, ruleId: string) {
  const month = monthKey(new Date());
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
  const budgeted = (Number(rule.budgetedAmount) || 0) * occurrence.multiplier;

  await setDoc(
    statsBudgetProgressRef(uid, month),
    { [ruleId]: { budgeted, spent, remaining: budgeted - spent, count } },
    { merge: true }
  );
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
