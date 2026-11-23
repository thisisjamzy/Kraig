'use client';

// One budget line opened in the side peek (Dreda.figcraft `Basket / Web /
// Item panel`, `Side peek / Item`) or as its own item page, top to bottom:
// the type chip, the item's name, "spent of planned" in mono, the status
// callout, the actions, then the properties as rows (each editable in
// place). Amounts and dates of a recurring line ask "This month only" or
// "This and future months".

import Link from 'next/link';
import { useState } from 'react';
import { ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Calendar, CalendarX, Check, CircleDot, LayoutGrid, ListChecks, Pencil, Receipt, Repeat, Tag, Wallet, Zap } from 'lucide-react';
import {
  EXPENSE_KIND_LABEL,
  FLOW_NOUN,
  INCOME_SUBTYPE_LABEL,
  SAVINGS_MODE_LABEL,
  hasNeedAndPriority,
} from '@/src/shared/budget/flow';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import { PropertiesBlock, type Property } from '@/src/widgets/Database/PropertiesBlock';
import { NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import { formatAmountValue } from '@/src/widgets/Database/format';
import { automationFromValue, automationOptions, automationValue, type ColumnContext } from './columns';
import { monthTitle } from '@/src/viewmodels/planning';
import styles from './BudgetMonth.module.css';
import peek from './LinePeek.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

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
  const formLink = useFormLink();
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `${formatAmountValue(n)} ${currency}`;
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
        { id: 'bucket', icon: <LayoutGrid />, label: line.type === 'Savings' ? 'Savings basket' : 'Basket', display: <Link className={styles.relation} href={`/budget/basket/${line.bucketId}?month=${line.month}`}>{line.bucketName}</Link> },
    { id: 'month', icon: <Calendar />, label: 'Month', display: monthTitle(line.month) },
    { id: 'repeats', icon: <Repeat />, label: 'Repeats', display: line.recurring ? 'Every month' : 'Once' },
  ];
  if (line.type === 'Income') {
    properties.push({
      id: 'subtype',
      icon: <Tag />,
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
      icon: <ArrowLeftRight />,
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
      icon: <Tag />,
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
        icon: <CircleDot />,
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
        icon: <ListChecks />,
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
    { id: 'due', icon: <Calendar />, label: line.type === 'Income' ? 'Expected date' : line.type === 'Transfer' ? 'Date' : 'Due date', edit: { type: 'date', value: line.due, onSave: editDate } },
    { id: 'planned', icon: <Receipt />, label: line.type === 'Income' ? 'Expected' : 'Planned', display: money(line.planned), edit: { type: 'currency', value: line.planned, onSave: editAmount } },
    { id: 'actual', icon: <ListChecks />, label: actualLabel, display: money(line.actual) },
  );
  if (line.type === 'Income' && line.borrowed) properties.push({ id: 'borrowed', label: 'Of which borrowed', display: money(line.borrowed) });
  if (line.type === 'Savings' && line.withdrawn) properties.push({ id: 'withdrawn', label: 'Withdrawn', display: money(line.withdrawn) });
  if (line.type !== 'Income') properties.push({ id: 'left', icon: <Receipt />, label: 'Left on this item', display: <span data-tone={line.left < 0 ? 'bad' : undefined} className={styles.toneText}>{money(line.left)}</span> });
  properties.push({ id: 'status', icon: <CircleDot />, label: 'Status', display: <span className={styles.chip} data-tone={line.stateTone}>{line.state}</span> });
  if (line.type === 'Transfer') {
    properties.push(
      { id: 'from', icon: <Wallet />, label: 'From account', edit: { type: 'select', value: line.accountId, options: accounts, onSave: (next) => ctx.setField(line, { accountId: next }) } },
      { id: 'to', icon: <Wallet />, label: 'To account', edit: { type: 'select', value: line.toAccountId, options: accounts, onSave: (next) => ctx.setField(line, { toAccountId: next }) } },
      { id: 'fee', icon: <Receipt />, label: 'Fee', display: line.fee ? money(line.fee) : null }
    );
  } else {
    properties.push({ id: 'account', icon: <Wallet />, label: 'Wallet', edit: { type: 'select', value: line.accountId, options: accounts, onSave: (next) => ctx.setField(line, { accountId: next }) } });
  }
  if (line.type !== 'Income') {
    properties.push({
      id: 'automation',
      icon: <Zap />,
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

  const TypeIcon = TYPE_ICON[line.type];
  const kindLabel = line.type === 'Expense' && line.expenseKind ? `${EXPENSE_KIND_LABEL[line.expenseKind as keyof typeof EXPENSE_KIND_LABEL] ?? FLOW_NOUN[line.type]}` : FLOW_NOUN[line.type];
  const callout =
    line.stateTone === 'watch' || line.stateTone === 'bad'
      ? {
          tone: line.stateTone === 'bad' ? 'danger' : 'warning',
          title: line.left < 0 ? `${money(-line.left)} over plan` : line.left > 0 && line.state !== 'Received' ? `${money(line.left)} left` : line.state,
          text: `${line.name} is ${line.state.toLowerCase()} for ${monthTitle(line.month)}.`,
        }
      : null;

  return (
    <>
      {compactTitle ? (
        <header className={peek.hero}>
          <span className={peek.typeChip} data-type={line.type}>
            <TypeIcon size={14} strokeWidth={2.25} aria-hidden />
            {kindLabel}
          </span>
          <h2 className={peek.name}>{line.name}</h2>
          <p className={peek.figure}>
            {formatAmountValue(line.actual)} of {formatAmountValue(line.planned)}
          </p>
        </header>
      ) : (
        <NotionPageHeader title={line.name} kind={`${FLOW_NOUN[line.type]} line · ${monthTitle(line.month)}`} />
      )}
      {callout && (
        <aside className={peek.callout} data-tone={callout.tone}>
          <p className={peek.calloutTitle}>
            <Zap size={16} strokeWidth={2.25} aria-hidden />
            {callout.title}
          </p>
          <p className={peek.calloutText}>{callout.text}</p>
        </aside>
      )}
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
        <Link href={formLink('basket-item', { basket: line.bucketId, item: line.itemId })} className={styles.ghostButton}>
          <Pencil size={14} strokeWidth={2.25} aria-hidden /> Edit item
        </Link>
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
      {/* A side peek is narrow: the block reads as rows (container query). */}
      <PropertiesBlock properties={properties} columns={compactTitle ? 1 : undefined} />
    </>
  );
}

const TYPE_ICON = { Expense: ArrowUpRight, Income: ArrowDownLeft, Savings: ArrowDownToLine, Transfer: ArrowLeftRight } as const;
