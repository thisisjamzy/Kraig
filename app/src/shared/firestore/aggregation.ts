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
// every setDoc/updateDoc call site in src/logic): create a transaction,
// create a transfer, create/edit-amount/archive a budget rule. There is no
// edit or delete UI for transactions/transfers, so unlike the Cloud
// Function version this never has to reverse an old contribution — it only
// ever applies a new one. If transaction editing/deleting is ever added,
// this needs a reverse-then-apply path added alongside it (see
// functions/src/transactions.ts's header comment for why that's the safe
// pattern once "reverse" is a real case, not "always fully rewrite the
// whole file to support it" — the emulator-tested design already exists
// there, mirror it rather than re-deriving it).

import { runTransaction, getDoc, getDocs, query, where, setDoc, increment, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';
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
} from './refs';
import { convert, type CurrencyContext } from './currency';
import { toRecurrenceRule } from './recurrence';
import { ruleAppliesToMonth } from '@dreda/shared-recurrence';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
}

/**
 * Writes a new transaction and, in the same runTransaction(), updates its
 * account's currentBalance and statsMonthly/stats-home — the same fields
 * onTransactionWrite's applyDelta() maintains, computed directly here
 * instead of via a trigger. statsBudgetProgress is recomputed afterward
 * (needs a query, which Firestore transactions can't run — same ordering
 * onTransactionWrite itself used, see its own comment on why that recompute
 * runs after the batch commits, not inside it). `input.createdBy` doubles
 * as the uid whose subcollections this writes to — the caller is always the
 * account owner writing their own data (see refs.ts's header).
 */
export async function createTransactionWithAggregation(input: CreateTransactionInput, ctx: CurrencyContext) {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();
  const signedAmount = input.direction === 'Inflow' ? input.amount : -input.amount;
  const month = monthKey(input.date);
  const currentMonth = monthKey(new Date());
  const dateTimestamp = Timestamp.fromDate(input.date);

  await runTransaction(db, async (tx) => {
    const accountSnap = await tx.get(accountRef(uid, input.accountId));
    if (accountSnap.data()?.frozen) {
      throw new Error('This wallet is frozen — unfreeze it before recording a transaction against it.');
    }
    const nativeCurrency = (accountSnap.data()?.currency as string | undefined) ?? ctx.base;
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
  });

  if (input.categoryId) {
    await recomputeBudgetProgressForCategoryMonth(uid, input.categoryId, month);
  }
}

export interface CreateTransferInput {
  id: string;
  date: Date;
  description: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  kind: string;
  createdBy: string;
}

/**
 * Writes a new transfer and moves both accounts' currentBalance — the same
 * scope onTransferWrite had (native currency only, never touches stats*,
 * see that file's own comment on the cross-currency-transfer limitation
 * this inherits unchanged). `input.createdBy` doubles as the uid whose
 * subcollections this writes to.
 */
export async function createTransferWithAggregation(input: CreateTransferInput) {
  const uid = input.createdBy;
  const db = getFirebaseFirestore();
  const dateTimestamp = Timestamp.fromDate(input.date);

  await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([
      tx.get(accountRef(uid, input.fromAccountId)),
      tx.get(accountRef(uid, input.toAccountId)),
    ]);
    if (fromSnap.data()?.frozen || toSnap.data()?.frozen) {
      throw new Error('One of these wallets is frozen — unfreeze it before transferring.');
    }

    tx.set(transferRef(uid, input.id), {
      date: dateTimestamp,
      description: input.description,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      kind: input.kind,
      notes: '',
      createdBy: input.createdBy,
      createdAt: dateTimestamp,
    });
    tx.update(accountRef(uid, input.fromAccountId), { currentBalance: increment(-input.amount) });
    tx.update(accountRef(uid, input.toAccountId), { currentBalance: increment(input.amount) });
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
