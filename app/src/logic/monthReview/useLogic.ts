'use client';

// Start-of-month review: the month's lines in four sections (Income,
// Expenses, Savings, Transfers), amounts and dates editable for this month
// only, a total per section and the resulting Left to plan. Variable
// expenses can roll their unused amount into the next month. Confirming
// saves the edits, applies last month's rollovers, and marks the month
// reviewed.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { editMonthLine, updateItemFields } from '@/src/shared/firestore/bucketBudget';
import { markMonthReviewed } from '@/src/shared/firestore/budgetMonths';
import { convert } from '@/src/shared/firestore/currency';
import { FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { monthTitle, shiftMonth } from '@/src/viewmodels/planning';
import { fromInputDate, toInputDate } from '@/src/widgets/Database/format';
import { lineRows, type LineRow } from '@/src/logic/budgetMonth/lines';

function monthFromUrl(): string {
  if (typeof window === 'undefined') return monthKeyOf(new Date());
  const raw = new URLSearchParams(window.location.search).get('month');
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : monthKeyOf(new Date());
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function useLogic() {
  const { user } = useFirebaseUser();
  const [month] = useState(monthFromUrl);
  const data = useMonthBudget(month);
  const previous = useMonthBudget(shiftMonth(month, -1));
  const today = useMemo(() => new Date(), []);
  const names = useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts]);
  const rows = useMemo(() => lineRows(data.budget, today, (id) => (id ? (names.get(id) ?? null) : null)), [data.budget, today, names]);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [rollover, setRollover] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountOf = (line: LineRow) => {
    const raw = amounts[line.key];
    if (raw === undefined) return line.planned;
    const n = Number(raw.replace(/[\s,]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : line.planned;
  };
  const sectionTotal = (type: FlowType) => r2(rows[type].reduce((s, l) => s + amountOf(l), 0));
  const fees = r2(rows.Transfer.reduce((s, l) => s + l.fee, 0));
  const leftToPlan = r2(sectionTotal('Income') - sectionTotal('Expense') - fees - sectionTotal('Savings'));

  // Last month's unused amount on each rollover line, carried into this one.
  const carried = useMemo(() => {
    const out = new Map<string, number>();
    for (const line of previous.budget.items) {
      if (line.type !== 'Expense' || !line.rollover) continue;
      const left = r2(line.available - line.actual);
      if (left > 0) out.set(line.itemId, left);
    }
    return out;
  }, [previous.budget]);

  async function confirm(): Promise<boolean> {
    const uid = user?.uid;
    if (!uid) return false;
    setBusy(true);
    setError(null);
    try {
      const currencyOf = (bucketId: string) => data.buckets.find((b) => b.id === bucketId)?.currency ?? data.ctx.display;
      for (const type of FLOW_TYPES) {
        for (const line of rows[type]) {
          const toBucket = (n: number) => convert(n, data.ctx.display, currencyOf(line.bucketId), data.ctx.rates);
          const extra = type === 'Expense' && !line.isOverride ? (carried.get(line.itemId) ?? 0) : 0;
          const amount = amountOf(line) + extra;
          const date = dates[line.key] !== undefined ? fromInputDate(dates[line.key]) : undefined;
          if (amount !== line.planned || date !== undefined) {
            await editMonthLine(uid, line.bucketId, line.itemId, month, { amount: toBucket(amount), ...(date !== undefined ? { dueDate: date } : {}) }, 'month', {
              amount: toBucket(line.planned),
              due: line.due,
              recurring: line.recurring,
            });
          }
          if (rollover[line.key] !== undefined && rollover[line.key] !== line.rollover) {
            await updateItemFields(uid, line.bucketId, line.itemId, { rollover: rollover[line.key] });
          }
        }
      }
      await markMonthReviewed(uid, month);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the review.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    month,
    title: monthTitle(month),
    currency: data.ctx.display,
    rows,
    amountText: (line: LineRow) => amounts[line.key] ?? Math.round(line.planned).toLocaleString('en-US'),
    setAmount: (line: LineRow, text: string) => setAmounts((a) => ({ ...a, [line.key]: text })),
    dateText: (line: LineRow) => dates[line.key] ?? toInputDate(line.due),
    setDate: (line: LineRow, text: string) => setDates((d) => ({ ...d, [line.key]: text })),
    rolloverOf: (line: LineRow) => rollover[line.key] ?? line.rollover,
    setRollover: (line: LineRow, on: boolean) => setRollover((r) => ({ ...r, [line.key]: on })),
    carriedFor: (line: LineRow) => (line.isOverride ? 0 : (carried.get(line.itemId) ?? 0)),
    sectionTotal,
    fees,
    leftToPlan,
    confirm,
    busy,
    error,
    loading: data.loading || previous.loading,
  };
}
