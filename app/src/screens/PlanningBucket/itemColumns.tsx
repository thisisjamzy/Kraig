'use client';

// The basket page's items database (web and tablet): Name (frozen),
// Planned, Spent, Left, Due ("5 Oct"), Need · Priority as one chip, Paid
// from, Automation (icon and label) and Status (Unpaid, Paid, Overdue,
// Waiting for income, Over plan); Kind, Repeats, Description, Not before
// and Needed by are there but hidden until switched on. Numbers are right
// aligned and never cut; the table scrolls inside its block when needed.

import { Bell, Clock, Zap, ZapOff } from 'lucide-react';
import type { FieldOption, FieldValue } from '@/src/shared/listQuery/engine';
import { EXPENSE_KIND_LABEL, type FlowType } from '@/src/shared/budget/flow';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { STATUS_TONE } from '@/src/logic/planningBucket/basketPage';
import type { ColumnDef, GroupDef } from '@/src/widgets/Database/types';
import type { ColumnContext } from '@/src/screens/BudgetMonth/columns';
import type { FirestoreBucketLineItem } from '@/src/shared/firestore/types';
import styles from './BucketPage.module.css';

const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const NEED_WORD = { MustHave: 'Must have', NiceToHave: 'Nice to have' } as const;

export const ITEM_STATUSES = ['Unpaid', 'Waiting for income', 'Overdue', 'Over plan', 'Paid'];

export function needPriority(r: LineRow): string | null {
  const need = r.necessity ? NEED_WORD[r.necessity] : null;
  return [need, r.priority].filter(Boolean).join(' · ') || null;
}

function AutomationCell({ r }: { r: LineRow }) {
  const Icon = r.automation.mode === 'prepare' ? (r.automation.trigger === 'due' ? Clock : Zap) : r.automation.mode === 'remind' ? Bell : ZapOff;
  return (
    <span className={styles.autoCell} data-off={r.automation.mode === 'off' || undefined}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      {r.automationText}
    </span>
  );
}

export function basketItemColumns(
  type: FlowType,
  ctx: ColumnContext,
  statusOf: (r: LineRow) => string,
  template: (r: LineRow) => FirestoreBucketLineItem | undefined
): ColumnDef<LineRow>[] {
  const actualLabel = type === 'Income' ? 'Received' : type === 'Savings' ? 'Saved' : type === 'Transfer' ? 'Moved' : 'Spent';
  const amountEdit = async (r: LineRow, next: FieldValue) => {
    if (typeof next !== 'number' || next < 0) throw new Error('Enter an amount.');
    const scope = r.recurring ? await ctx.askScope(r) : 'month';
    if (scope) await ctx.editAmount(r, next, scope);
  };
  const statusOptions: FieldOption[] = ITEM_STATUSES.map((s) => ({ value: s, label: s }));
  const columns: ColumnDef<LineRow>[] = [
    { id: 'name', label: 'Name', type: 'text', width: 220, value: (r) => r.name, calc: 'count' },
    { id: 'planned', label: type === 'Income' ? 'Expected' : 'Planned', type: 'currency', width: 130, value: (r) => r.available, calc: 'sum', edit: amountEdit, onCard: true },
    { id: 'spent', label: actualLabel, type: 'currency', width: 130, value: (r) => r.actual, calc: 'sum', onCard: true },
    {
      id: 'left',
      label: type === 'Income' ? 'To come' : 'Left',
      type: 'currency',
      width: 130,
      value: (r) => r.left,
      calc: 'sum',
      tone: (r) => (r.left < -0.5 && type !== 'Income' ? 'bad' : undefined),
      onCard: true,
    },
    {
      id: 'due',
      label: type === 'Income' ? 'Expected on' : 'Due',
      type: 'date',
      width: 96,
      value: (r) => r.due,
      render: (r) => (r.due ? short(r.due) : null),
      edit: async (r, next) => {
        const scope = r.recurring ? await ctx.askScope(r) : 'month';
        if (scope) await ctx.editDate(r, next instanceof Date ? next : null, scope);
      },
      onCard: true,
    },
  ];
  if (type === 'Expense' || type === 'Savings') {
    columns.push({
      id: 'needPriority',
      label: 'Need · Priority',
      type: 'text',
      width: 170,
      value: needPriority,
      render: (r) => {
        const text = needPriority(r);
        return text ? (
          <span className={styles.chip} data-need={r.necessity ?? undefined}>
            {text}
          </span>
        ) : null;
      },
      onCard: true,
    });
  }
  if (type !== 'Income') {
    columns.push(
      { id: 'paidFrom', label: 'Paid from', type: 'text', width: 160, value: (r) => r.accountName },
      { id: 'automation', label: 'Automation', type: 'text', width: 210, value: (r) => r.automationText, render: (r) => <AutomationCell r={r} /> }
    );
  }
  columns.push(
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 160,
      options: type === 'Expense' ? statusOptions : undefined,
      value: statusOf,
      render: (r) => {
        const s = statusOf(r);
        return (
          <span className={styles.status} data-tone={STATUS_TONE[s] ?? 'neutral'}>
            {s}
          </span>
        );
      },
      onCard: true,
    },
    // Hidden until switched on in View settings.
    { id: 'kind', label: 'Kind', type: 'text', width: 110, hidden: true, value: (r) => (r.expenseKind ? EXPENSE_KIND_LABEL[r.expenseKind] : r.kind) },
    { id: 'repeats', label: 'Repeats', type: 'text', width: 120, hidden: true, value: (r) => (r.recurring ? 'Every month' : 'Once') },
    { id: 'description', label: 'Description', type: 'text', width: 220, hidden: true, value: (r) => template(r)?.description || null },
    { id: 'notBefore', label: 'Not before', type: 'date', width: 110, hidden: true, value: (r) => template(r)?.notBefore?.toDate() ?? null },
    { id: 'neededBy', label: 'Needed by', type: 'date', width: 110, hidden: true, value: (r) => template(r)?.neededBy?.toDate() ?? null }
  );
  return columns;
}

/** Board by Status (expenses), or by the line's own state. */
export function statusGroup(statusOf: (r: LineRow) => string): GroupDef<LineRow> {
  return { id: 'status', label: 'Status', key: (r) => ({ key: statusOf(r), label: statusOf(r) }), order: ITEM_STATUSES };
}
