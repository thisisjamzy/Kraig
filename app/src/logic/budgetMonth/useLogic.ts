'use client';

// The Budget page (one month) on medium screens and up: the month's totals
// per flow type, its lines in four separate databases (Income, Expenses,
// Savings, Transfers), the start-of-month banner, "did it arrive?" income
// prompts, and every edit the page makes — month-only or this-and-future
// line edits, inline properties, mark paid, and bulk actions.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useBudgetMonthDoc, useFlowMigrationReport } from '@/src/shared/hooks/useBudgetMonthState';
import { editMonthLine, skipItemMonth, updateItemFields, type EditScope } from '@/src/shared/firestore/bucketBudget';
import { createBucketLineItem, recordBucketLineItemPayment } from '@/src/shared/firestore/aggregation';
import { dismissMonthBanner, snoozeIncomePrompt } from '@/src/shared/firestore/budgetMonths';
import { moveBucketItem } from '@/src/shared/firestore/flowMigration';
import { convert } from '@/src/shared/firestore/currency';
import { incomePrompts } from '@/src/shared/budget/automation';
import { setupBannerText } from '@/src/shared/budget/monthSetup';
import { FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { daysLeftIn, monthPhase, monthTitle } from '@/src/viewmodels/planning';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { lineRows, mustHaves, type LineRow } from './lines';

export function useBudgetMonth(month: string, data: PlanningData) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { budget, totals, buckets, accounts, ctx, itemsByBucket } = data;
  const today = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<FlowType>('Expense');

  const accountNames = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const rows = useMemo(() => lineRows(budget, today, (id) => (id ? (accountNames.get(id) ?? null) : null)), [budget, today, accountNames]);

  const { data: monthDoc } = useBudgetMonthDoc(month);
  const migration = useFlowMigrationReport();

  const phase = monthPhase(month, today);
  const daysLeft = daysLeftIn(month, today);
  const banner =
    monthDoc && !monthDoc.reviewedAt && !monthDoc.bannerDismissedAt && phase !== 'past' ? setupBannerText(month, monthDoc.counts) : null;

  const prompts = useMemo(() => (phase === 'past' ? [] : incomePrompts(budget, today, monthDoc?.incomeSnoozed ?? {})), [budget, today, monthDoc, phase]);

  const must = mustHaves(rows.Expense.concat(rows.Savings), totals.availableNow, totals.availableByMonthEnd);

  const bucketsOf = (type: FlowType) =>
    buckets.filter((b) => !b.archived && (b.type ?? 'Expense') === type).sort((a, b) => a.name.localeCompare(b.name));
  const spendable = accounts.filter((a) => !a.archived && !a.frozen);

  function need(): string {
    if (!uid) throw new Error('Sign in again to save.');
    return uid;
  }
  const rawItem = (line: Pick<LineRow, 'bucketId' | 'itemId'>) => itemsByBucket[line.bucketId]?.find((i) => i.id === line.itemId);
  // Display amounts back to the bucket's own currency.
  const toBucket = (amount: number, bucketId: string) =>
    convert(amount, ctx.display, buckets.find((b) => b.id === bucketId)?.currency ?? ctx.display, ctx.rates);

  async function editAmount(line: LineRow, amount: number, scope: EditScope) {
    await editMonthLine(need(), line.bucketId, line.itemId, line.month, { amount: toBucket(amount, line.bucketId) }, scope, {
      amount: toBucket(line.planned, line.bucketId),
      due: line.due,
      recurring: line.recurring,
    });
  }
  async function editDate(line: LineRow, date: Date | null, scope: EditScope) {
    await editMonthLine(need(), line.bucketId, line.itemId, line.month, { dueDate: date }, scope, {
      amount: toBucket(line.planned, line.bucketId),
      due: line.due,
      recurring: line.recurring,
    });
  }
  async function setField(line: Pick<LineRow, 'bucketId' | 'itemId'>, patch: Record<string, unknown>) {
    await updateItemFields(need(), line.bucketId, line.itemId, patch);
  }

  async function markPaid(line: LineRow, amount = line.left, accountId = line.accountId) {
    if (!accountId) throw new Error(`Choose an account for "${line.name}" first.`);
    if (amount <= 0) return;
    const item = rawItem(line);
    await recordBucketLineItemPayment(
      need(),
      line.bucketId,
      line.itemId,
      toBucket(amount, line.bucketId),
      true,
      {
        accountId,
        categoryId: item?.categoryId ?? line.categoryId,
        date: new Date(),
        description: line.name,
        categoryType: line.type,
        toAccountId: line.toAccountId,
        charges: item?.charges ?? null,
        occurrenceMonth: line.month,
      },
      ctx
    );
  }

  /** "Did it arrive?" — Yes (or a different amount) records it; Not yet asks again tomorrow. */
  async function recordIncome(line: LineRow, amount: number, accountId: string | null) {
    const account = accountId ?? line.accountId ?? spendable.find((a) => !isSavingsAccount(a))?.id ?? null;
    if (!account) throw new Error('Add a wallet to record income into first.');
    await markPaid({ ...line, left: amount }, amount, account);
    showToast(`${line.name} recorded`);
  }
  async function notYet(line: LineRow) {
    await snoozeIncomePrompt(need(), month, line.key, new Date());
  }

  async function bulkMarkPaid(lines: LineRow[]) {
    for (const line of lines) if (line.left > 0 && !line.closed) await markPaid(line);
    showToast(`${lines.length} ${lines.length === 1 ? 'line' : 'lines'} marked paid`);
  }
  async function bulkAccount(lines: LineRow[], accountId: string) {
    for (const line of lines) await setField(line, { accountId });
  }
  async function bulkMove(lines: LineRow[], bucketId: string) {
    for (const line of lines) await moveBucketItem(need(), line.itemId, line.bucketId, bucketId);
  }
  /** Deletes the line for this month only — the template keeps the other months. */
  async function bulkSkip(lines: LineRow[]) {
    for (const line of lines) await skipItemMonth(need(), line.bucketId, line.itemId, line.month);
    showToast(`${lines.length} ${lines.length === 1 ? 'line' : 'lines'} removed from ${monthTitle(month)}`);
  }

  /** Quick entry: a one-off line in this month, in the group's bucket. */
  async function createLine(type: FlowType, values: { name?: unknown; amount?: unknown; due?: unknown }, bucketId: string | null) {
    const target = bucketId ?? bucketsOf(type)[0]?.id;
    if (!target) throw new Error(`Add a ${type.toLowerCase()} bucket first.`);
    const name = typeof values.name === 'string' ? values.name.trim() : '';
    const amount = typeof values.amount === 'number' ? values.amount : NaN;
    if (!name) throw new Error('Give the line a name.');
    if (!(amount > 0)) throw new Error('Enter an amount.');
    const [y, m] = month.split('-').map(Number);
    const due = values.due instanceof Date ? values.due : new Date(y, m - 1, Math.min(today.getDate(), new Date(y, m, 0).getDate()));
    const bucket = buckets.find((b) => b.id === target)!;
    await createBucketLineItem(need(), target, bucket.kind === 'Fixed' ? 'Fixed' : 'Variable', {
      name,
      description: '',
      amount,
      priority: 'Medium',
      necessity: 'NiceToHave',
      categoryId: type === 'Transfer' ? 'Wallet to wallet' : '',
      categoryType: type,
      accountId: null,
      dueDate: due,
      recurrence: null,
    });
  }

  return {
    month,
    title: monthTitle(month),
    isCurrent: month === monthKeyOf(today),
    phase,
    daysLeft,
    today,
    currency: ctx.display,
    totals,
    rows,
    tab,
    setTab,
    types: FLOW_TYPES,
    must,
    banner,
    reviewed: Boolean(monthDoc?.reviewedAt),
    dismissBanner: () => uid && dismissMonthBanner(uid, month),
    migrationPending: migration.pending,
    prompts: prompts.map((p) => rows.Income.find((r) => r.key === p.key)!).filter(Boolean),
    recordIncome,
    notYet,
    accounts: spendable,
    savingsAccounts: spendable.filter(isSavingsAccount),
    bucketsOf,
    incomeLines: rows.Income,
    editAmount,
    editDate,
    setField,
    markPaid,
    bulkMarkPaid,
    bulkAccount,
    bulkMove,
    bulkSkip,
    createLine,
    loading: data.loading,
  };
}

export type BudgetMonth = ReturnType<typeof useBudgetMonth>;
