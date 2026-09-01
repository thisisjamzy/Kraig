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
    assertNotBelowLocked(accountSnap.data(), signedAmount);
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
