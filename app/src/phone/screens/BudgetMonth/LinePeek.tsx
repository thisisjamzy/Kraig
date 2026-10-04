'use client';

// One budget line opened in the side peek (or as its own item page): the
// title, its kind, the properties block (each editable in place) and the
// actions it needs. Amounts and dates of a recurring line ask "This month
// only" or "This and future months".

import Link from 'next/link';
import { useState } from 'react';
import { CalendarX, Check, Pencil } from 'lucide-react';
import {
  EXPENSE_KIND_LABEL,
  FLOW_NOUN,
  INCOME_SUBTYPE_LABEL,
  SAVINGS_MODE_LABEL,
  hasNeedAndPriority,
} from '@/src/shared/budget/flow';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { PropertiesBlock, type Property } from '@/src/phone/widgets/Database/PropertiesBlock';
import { NotionPageHeader } from '@/src/phone/widgets/Database/NotionPage';
import { formatNumber } from '@/src/widgets/Database/format';
import { automationFromValue, automationOptions, automationValue, type ColumnContext } from '@/src/phone/screens/BudgetMonth/columns';
import { monthTitle } from '@/src/viewmodels/planning';
import styles from '@/src/phone/screens/BudgetMonth/BudgetMonth.module.css';

export function LinePeekContent({
  line,
  ctx,
  currency,
  onSkip,
  compactTitle = true,
}: {
  line: LineRow;
  ctx: ColumnContext;
  currency: string;
  onSkip: (line: LineRow) => Promise<void>;
  compactTitle?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `${formatNumber(n)} ${currency}`;
  const accounts = ctx.accounts.map((a) => ({ value: a.id, label: a.name }));
  const actualLabel = line.type === 'Income' ? 'Received' : line.type === 'Savings' ? 'Saved' : line.type === 'Transfer' ? 'Moved' : 'Spent';

  async function editAmount(next: unknown) {
    if (typeof next !== 'number') return;
    const scope = line.recurring ? await ctx.askScope(line) : 'month';
    if (scope) await ctx.editAmount(line, next, scope);
  }
  async function editDate(next: unknown) {
    const scope = line.recurring ? await ctx.askScope(line) : 'month';
    if (scope) await ctx.editDate(line, next instanceof Date ? next : null, scope);
  }

  const properties: Property[] = [
    { id: 'type', label: 'Type', display: FLOW_NOUN[line.type] },
    { id: 'bucket', label: line.type === 'Savings' ? 'Goal' : 'Bucket', display: <Link className={styles.relation} href={`/budget/bucket/${line.bucketId}?month=${line.month}`}>{line.bucketName}</Link> },
    { id: 'month', label: 'Month', display: monthTitle(line.month) },
    { id: 'repeats', label: 'Repeats', display: line.recurring ? 'Every month' : 'Once' },
  ];
  if (line.type === 'Income') {
    properties.push({
      id: 'subtype',
      label: 'Subtype',
      edit: {
        type: 'select',
        value: line.incomeSubtype,
        options: Object.entries(INCOME_SUBTYPE_LABEL).map(([value, label]) => ({ value, label })),
        onSave: (next) => ctx.setField(line, { incomeSubtype: next }),
      },
    });
  }
  if (line.type === 'Expense') {
    properties.push({
      id: 'kind',
      label: 'Kind',
      edit: {
        type: 'select',
        value: line.expenseKind,
        options: Object.entries(EXPENSE_KIND_LABEL).map(([value, label]) => ({ value, label })),
        onSave: (next) => ctx.setField(line, { expenseKind: next }),
      },
    });
  }
  if (line.type === 'Savings') {
    properties.push({
      id: 'mode',
      label: 'Absolute or flexible',
      edit: {
        type: 'select',
        value: line.savingsMode,
        options: Object.entries(SAVINGS_MODE_LABEL).map(([value, label]) => ({ value, label })),
        onSave: (next) => ctx.setField(line, { savingsMode: next }),
      },
    });
  }
  if (hasNeedAndPriority(line.type)) {
    properties.push(
      {
        id: 'need',
        label: 'Need',
        edit: {
          type: 'select',
          value: line.necessity,
          options: [
            { value: 'MustHave', label: 'Must have' },
            { value: 'NiceToHave', label: 'Nice to have' },
          ],
          onSave: (next) => ctx.setField(line, { necessity: next }),
        },
      },
      {
        id: 'priority',
        label: 'Priority',
        edit: {
          type: 'select',
          value: line.priority,
          options: ['Urgent', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p })),
          onSave: (next) => ctx.setField(line, { priority: next }),
        },
      }
    );
  }
  properties.push(
    { id: 'due', label: line.type === 'Income' ? 'Expected date' : line.type === 'Transfer' ? 'Date' : 'Due date', edit: { type: 'date', value: line.due, onSave: editDate } },
    { id: 'planned', label: line.type === 'Income' ? 'Expected' : 'Planned', display: money(line.planned), edit: { type: 'currency', value: line.planned, onSave: editAmount } },
    { id: 'actual', label: actualLabel, display: money(line.actual) },
  );
  if (line.type === 'Income' && line.borrowed) properties.push({ id: 'borrowed', label: 'Of which borrowed', display: money(line.borrowed) });
  if (line.type === 'Savings' && line.withdrawn) properties.push({ id: 'withdrawn', label: 'Withdrawn', display: money(line.withdrawn) });
  if (line.type !== 'Income') properties.push({ id: 'left', label: 'Left', display: <span data-tone={line.left < 0 ? 'bad' : undefined} className={styles.toneText}>{money(line.left)}</span> });
  properties.push({ id: 'status', label: 'Status', display: <span className={styles.chip} data-tone={line.stateTone}>{line.state}</span> });
  if (line.type === 'Transfer') {
    properties.push(
      { id: 'from', label: 'From account', edit: { type: 'select', value: line.accountId, options: accounts, onSave: (next) => ctx.setField(line, { accountId: next }) } },
      { id: 'to', label: 'To account', edit: { type: 'select', value: line.toAccountId, options: accounts, onSave: (next) => ctx.setField(line, { toAccountId: next }) } },
      { id: 'fee', label: 'Fee', display: line.fee ? money(line.fee) : null }
    );
  } else {
    properties.push({ id: 'account', label: 'Account', edit: { type: 'select', value: line.accountId, options: accounts, onSave: (next) => ctx.setField(line, { accountId: next }) } });
  }
  if (line.type !== 'Income') {
    properties.push({
      id: 'automation',
      label: 'Automation',
      edit: {
        type: 'select',
        value: automationValue(line.automation),
        options: automationOptions(ctx.incomeLines),
        onSave: (next) => (typeof next === 'string' ? ctx.setField(line, { automation: automationFromValue(next, line.automation) }) : undefined),
      },
    });
    if (line.type === 'Savings' && line.automation.mode === 'prepare' && line.automation.trigger !== 'due') {
      properties.push({
        id: 'percent',
        label: 'Amount when prepared',
        display: line.automation.amountMode === 'percent' && line.automation.percent ? `${line.automation.percent}% of the income` : 'The planned amount',
        edit: {
          type: 'number',
          value: line.automation.amountMode === 'percent' ? (line.automation.percent ?? null) : null,
          onSave: (next) =>
            ctx.setField(line, {
              automation: { ...line.automation, amountMode: typeof next === 'number' && next > 0 ? 'percent' : 'fixed', percent: typeof next === 'number' && next > 0 ? Math.min(100, next) : null },
            }),
        },
      });
    }
  }

  const canPay = line.left > 0 && !line.closed && line.state !== 'Received';

  return (
    <>
      <NotionPageHeader
        title={line.name}
        kind={`${FLOW_NOUN[line.type]} line · ${monthTitle(line.month)}`}
        actions={
          compactTitle ? null : (
            <Link href={`/edit-bucket-item/${line.bucketId}/${line.itemId}`} className={styles.ghostButton}>
              <Pencil size={14} strokeWidth={2.25} aria-hidden /> Edit template
            </Link>
          )
        }
      />
      <PropertiesBlock properties={properties} />
      <div className={styles.peekActions}>
        {canPay && (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await ctx.markPaid(line);
              } catch (caught) {
                ctx.onError(caught instanceof Error ? caught.message : 'Could not record that.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check size={15} strokeWidth={2.5} aria-hidden />
            {line.type === 'Income' ? 'Mark received' : line.type === 'Savings' ? 'Mark saved' : line.type === 'Transfer' ? 'Mark moved' : 'Mark paid'} ({money(line.left)})
          </button>
        )}
        {compactTitle && (
          <Link href={`/edit-bucket-item/${line.bucketId}/${line.itemId}`} className={styles.ghostButton}>
            <Pencil size={14} strokeWidth={2.25} aria-hidden /> Edit template
          </Link>
        )}
        <button
          type="button"
          className={styles.ghostButton}
          data-danger
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSkip(line);
            } finally {
              setBusy(false);
            }
          }}
        >
          <CalendarX size={14} strokeWidth={2.25} aria-hidden /> Remove from {monthTitle(line.month)}
        </button>
      </div>
    </>
  );
}
