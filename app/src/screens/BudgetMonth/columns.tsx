'use client';

// The columns of each flow type's database — Income, Expenses, Savings and
// Transfers each have their own, never mixed. Shared by the Budget page and
// the Bucket page's items table. Cells edit in place: amounts and dates of
// a recurring line ask "This month only" or "This and future months".

import Link from 'next/link';
import type { FieldOption, FieldValue } from '@/src/shared/listQuery/engine';
import {
  EXPENSE_KIND_LABEL,
  INCOME_SUBTYPE_LABEL,
  SAVINGS_MODE_LABEL,
  type FlowType,
} from '@/src/shared/budget/flow';
import type { EditScope } from '@/src/shared/firestore/bucketBudget';
import type { ItemAutomation } from '@/src/shared/firestore/types';
import type { ColumnDef, DefaultView, GroupDef } from '@/src/widgets/Database/types';
import { formatNumber } from '@/src/widgets/Database/format';
import { coverHref, reallocateHref } from '@/src/screens/Planning/PlanningParts';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import styles from './BudgetMonth.module.css';

export interface ColumnContext {
  month: string;
  daysLeft: number | null;
  past: boolean;
  accounts: { id: string; name: string }[];
  incomeLines: { itemId: string; name: string }[];
  /** Resolves to null when the household closes the scope question. */
  askScope: (line: LineRow) => Promise<EditScope | null>;
  editAmount: (line: LineRow, amount: number, scope: EditScope) => Promise<void>;
  editDate: (line: LineRow, date: Date | null, scope: EditScope) => Promise<void>;
  setField: (line: LineRow, patch: Record<string, unknown>) => Promise<void>;
  markPaid: (line: LineRow) => Promise<void>;
  onError: (message: string) => void;
}

const NEED: FieldOption[] = [
  { value: 'MustHave', label: 'Must have', color: '#fde8ef' },
  { value: 'NiceToHave', label: 'Nice to have', color: '#e8eeff' },
];
const PRIORITY: FieldOption[] = [
  { value: 'Urgent', label: 'Urgent', color: '#fdecee' },
  { value: 'High', label: 'High', color: '#fdecee' },
  { value: 'Medium', label: 'Medium', color: '#fff3dc' },
  { value: 'Low', label: 'Low', color: '#eef1f8' },
];
const STATUS_OPTIONS = (states: string[]): FieldOption[] => states.map((s) => ({ value: s, label: s }));

/** The Automation cell's choices; "income:<itemId>" for one income line. */
export function automationOptions(incomeLines: { itemId: string; name: string }[]): FieldOption[] {
  return [
    { value: 'off', label: 'Off' },
    { value: 'remind', label: 'Remind me' },
    { value: 'due', label: 'Prepare on due date' },
    { value: 'any_income', label: 'Prepare when income arrives' },
    ...incomeLines.map((i) => ({ value: `income:${i.itemId}`, label: `Prepare when ${i.name} arrives` })),
  ];
}

export function automationValue(a: ItemAutomation): string {
  if (a.mode !== 'prepare') return a.mode;
  if (a.trigger === 'income' && a.incomeItemId) return `income:${a.incomeItemId}`;
  return a.trigger ?? 'any_income';
}

export function automationFromValue(value: string, current: ItemAutomation): ItemAutomation {
  const keep = { amountMode: current.amountMode ?? 'fixed', percent: current.percent ?? null, accountId: current.accountId ?? null };
  if (value === 'off' || value === 'remind') return { mode: value, ...keep };
  if (value.startsWith('income:')) return { mode: 'prepare', trigger: 'income', incomeItemId: value.slice(7), ...keep };
  return { mode: 'prepare', trigger: value as 'due' | 'any_income', incomeItemId: null, ...keep };
}

function money(n: number) {
  return formatNumber(n);
}

/** Status chip, with the one inline action the line needs. */
function StatusCell({ line, ctx }: { line: LineRow; ctx: ColumnContext }) {
  const over = line.state === 'Over plan' && line.unfunded > 0;
  const late = ctx.past || (ctx.daysLeft !== null && ctx.daysLeft < 5);
  const payable = line.type !== 'Income' && line.left > 0 && !line.closed && line.expenseKind !== 'variable' && ['Unpaid', 'Overdue', 'Not saved', 'Partly saved', 'Not moved'].includes(line.state);
  const leftover = line.type === 'Expense' && line.expenseKind === 'variable' && line.left > 0 && (late || line.closed);
  return (
    <span className={styles.statusCell}>
      <span className={styles.chip} data-tone={line.stateTone}>
        {line.state}
      </span>
      {payable && (
        <button
          type="button"
          className={styles.inlineAction}
          onClick={() => ctx.markPaid(line).catch((e) => ctx.onError(e instanceof Error ? e.message : 'Could not record that.'))}
        >
          Mark paid
        </button>
      )}
      {over && (
        <Link className={styles.inlineAction} href={coverHref(ctx.month, line.bucketId, line.itemId)}>
          Cover or justify
        </Link>
      )}
      {leftover && (
        <Link className={styles.inlineAction} href={reallocateHref(ctx.month, line.bucketId, line.itemId)}>
          Reallocate
        </Link>
      )}
    </span>
  );
}

function nameColumn(label = 'Name'): ColumnDef<LineRow> {
  return {
    id: 'name',
    label,
    type: 'text',
    width: 240,
    value: (r) => r.name,
    render: (r) => (
      <span className={styles.nameCell}>
        {r.name}
        {r.isOverride && <span className={styles.tag}>This month</span>}
      </span>
    ),
    newRow: true,
  };
}

function amountColumn(id: string, label: string, ctx: ColumnContext, field: 'planned' | 'actual' | 'left', editable = false, tone?: (r: LineRow) => 'bad' | undefined): ColumnDef<LineRow> {
  return {
    id,
    label,
    type: 'currency',
    width: 130,
    value: (r) => r[field],
    render: (r) => money(r[field]),
    calc: 'sum',
    tone,
    newRow: id === 'planned' || id === 'expected' || id === 'amount',
    ...(editable
      ? {
          edit: async (r: LineRow, next: FieldValue) => {
            if (typeof next !== 'number' || next < 0) throw new Error('Enter an amount.');
            const scope = r.recurring ? await ctx.askScope(r) : 'month';
            if (scope) await ctx.editAmount(r, next, scope);
          },
        }
      : {}),
  };
}

function dateColumn(id: string, label: string, ctx: ColumnContext): ColumnDef<LineRow> {
  return {
    id,
    label,
    type: 'date',
    width: 128,
    value: (r) => r.due,
    tone: (r) => (r.state === 'Overdue' || r.state === 'Late' ? 'bad' : undefined),
    edit: async (r, next) => {
      const date = next instanceof Date ? next : null;
      const scope = r.recurring ? await ctx.askScope(r) : 'month';
      if (scope) await ctx.editDate(r, date, scope);
    },
    newRow: true,
  };
}

function selectColumn(id: string, label: string, options: FieldOption[], value: (r: LineRow) => string | null, save: (r: LineRow, next: string) => Promise<void>, width = 130): ColumnDef<LineRow> {
  return { id, label, type: 'select', width, options, value, edit: (r, next) => (typeof next === 'string' ? save(r, next) : undefined) };
}

function accountColumn(ctx: ColumnContext, id = 'account', label = 'Account', field: 'accountId' | 'toAccountId' = 'accountId'): ColumnDef<LineRow> {
  const options = ctx.accounts.map((a) => ({ value: a.id, label: a.name }));
  return {
    id,
    label,
    type: 'select',
    width: 150,
    options,
    value: (r) => r[field],
    edit: (r, next) => (typeof next === 'string' ? ctx.setField(r, { [field]: next }) : undefined),
  };
}

function statusColumn(ctx: ColumnContext, states: string[]): ColumnDef<LineRow> {
  return {
    id: 'status',
    label: 'Status',
    type: 'select',
    width: 220,
    options: STATUS_OPTIONS(states),
    value: (r) => r.state,
    render: (r) => <StatusCell line={r} ctx={ctx} />,
  };
}

function automationColumn(ctx: ColumnContext): ColumnDef<LineRow> {
  return {
    id: 'automation',
    label: 'Automation',
    type: 'select',
    width: 200,
    options: automationOptions(ctx.incomeLines),
    value: (r) => automationValue(r.automation),
    edit: (r, next) => (typeof next === 'string' ? ctx.setField(r, { automation: automationFromValue(next, r.automation) }) : undefined),
  };
}

const bucketColumn = (label = 'Bucket'): ColumnDef<LineRow> => ({
  id: 'bucket',
  label,
  type: 'relation',
  width: 170,
  value: (r) => r.bucketName,
  render: (r) => (
    <Link className={styles.relation} href={`/budget/bucket/${r.bucketId}?month=${r.month}`}>
      {r.bucketName}
    </Link>
  ),
});

export function lineColumns(type: FlowType, ctx: ColumnContext, options: { bucket?: boolean } = {}): ColumnDef<LineRow>[] {
  const withBucket = options.bucket !== false;
  if (type === 'Income') {
    return [
      nameColumn(),
      { id: 'source', label: 'Source', type: 'text', width: 150, value: (r) => (r.categoryName === 'Uncategorized' ? '' : r.categoryName) },
      ...(withBucket ? [bucketColumn()] : []),
      selectColumn(
        'subtype',
        'Subtype',
        (Object.keys(INCOME_SUBTYPE_LABEL) as (keyof typeof INCOME_SUBTYPE_LABEL)[]).map((k) => ({ value: k, label: INCOME_SUBTYPE_LABEL[k] })),
        (r) => r.incomeSubtype,
        (r, next) => ctx.setField(r, { incomeSubtype: next }),
        150
      ),
      dateColumn('date', 'Expected date', ctx),
      amountColumn('expected', 'Expected', ctx, 'planned', true),
      amountColumn('received', 'Received', ctx, 'actual'),
      statusColumn(ctx, ['Expected', 'Received', 'Late', 'Partly received']),
      accountColumn(ctx),
    ];
  }
  if (type === 'Savings') {
    return [
      nameColumn(),
      ...(withBucket ? [bucketColumn('Goal')] : []),
      selectColumn(
        'mode',
        'Absolute or flexible',
        (Object.keys(SAVINGS_MODE_LABEL) as (keyof typeof SAVINGS_MODE_LABEL)[]).map((k) => ({ value: k, label: SAVINGS_MODE_LABEL[k] })),
        (r) => r.savingsMode,
        (r, next) => ctx.setField(r, { savingsMode: next }),
        160
      ),
      dateColumn('due', 'Due date', ctx),
      amountColumn('planned', 'Planned', ctx, 'planned', true),
      amountColumn('saved', 'Saved', ctx, 'actual'),
      statusColumn(ctx, ['Not saved', 'Partly saved', 'Saved', 'Overdue']),
      automationColumn(ctx),
      accountColumn(ctx),
    ];
  }
  if (type === 'Transfer') {
    return [
      nameColumn(),
      ...(withBucket ? [{ ...bucketColumn(), hidden: true }] : []),
      accountColumn(ctx, 'from', 'From account', 'accountId'),
      accountColumn(ctx, 'to', 'To account', 'toAccountId'),
      dateColumn('date', 'Date', ctx),
      amountColumn('amount', 'Amount', ctx, 'planned', true),
      { id: 'fee', label: 'Fee', type: 'currency', width: 100, value: (r) => r.fee, render: (r) => (r.fee ? money(r.fee) : ''), calc: 'sum' },
      statusColumn(ctx, ['Not moved', 'Moved', 'Overdue']),
      automationColumn(ctx),
    ];
  }
  return [
    nameColumn(),
    ...(withBucket ? [bucketColumn()] : []),
    selectColumn(
      'kind',
      'Kind',
      (Object.keys(EXPENSE_KIND_LABEL) as (keyof typeof EXPENSE_KIND_LABEL)[]).map((k) => ({ value: k, label: EXPENSE_KIND_LABEL[k] })),
      (r) => r.expenseKind,
      (r, next) => ctx.setField(r, { expenseKind: next }),
      110
    ),
    selectColumn('need', 'Need', NEED, (r) => r.necessity, (r, next) => ctx.setField(r, { necessity: next }), 130),
    selectColumn('priority', 'Priority', PRIORITY, (r) => r.priority, (r, next) => ctx.setField(r, { priority: next }), 110),
    dateColumn('due', 'Due date', ctx),
    amountColumn('planned', 'Planned', ctx, 'planned', true),
    amountColumn('spent', 'Spent', ctx, 'actual', false, (r) => (r.state === 'Over plan' ? 'bad' : undefined)),
    amountColumn('left', 'Left', ctx, 'left', false, (r) => (r.left < 0 ? 'bad' : undefined)),
    statusColumn(ctx, ['Unpaid', 'Paid', 'Overdue', 'Over plan']),
    automationColumn(ctx),
    accountColumn(ctx),
  ];
}

export const BY_BUCKET: GroupDef<LineRow> = { id: 'bucket', label: 'Bucket', key: (r) => ({ key: r.bucketId, label: r.bucketName }) };

export function groupsFor(type: FlowType): GroupDef<LineRow>[] {
  const status: GroupDef<LineRow> = { id: 'status', label: 'Status', key: (r) => ({ key: r.state, label: r.state }) };
  if (type === 'Expense') {
    return [
      BY_BUCKET,
      status,
      { id: 'kind', label: 'Kind', key: (r) => ({ key: r.expenseKind ?? 'fixed', label: EXPENSE_KIND_LABEL[r.expenseKind ?? 'fixed'] }) },
      { id: 'need', label: 'Need', key: (r) => ({ key: r.necessity ?? 'NiceToHave', label: r.necessity === 'MustHave' ? 'Must have' : 'Nice to have' }) },
    ];
  }
  if (type === 'Income') {
    return [BY_BUCKET, status, { id: 'subtype', label: 'Subtype', key: (r) => ({ key: r.incomeSubtype ?? 'earned', label: INCOME_SUBTYPE_LABEL[r.incomeSubtype ?? 'earned'] }) }];
  }
  return [BY_BUCKET, status];
}

/** A line database's views: Table (default), Cards, Needs attention. */
export function viewsFor(attention: (r: LineRow) => boolean): DefaultView<LineRow>[] {
  return [
    { id: 'table', name: 'Table', layout: 'table' },
    { id: 'cards', name: 'Cards', layout: 'cards' },
    { id: 'attention', name: 'Needs attention', layout: 'table', filter: attention },
  ];
}
