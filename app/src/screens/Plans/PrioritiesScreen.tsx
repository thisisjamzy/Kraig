'use client';

// Priorities — "What should I pay next?", as a page on every screen size:
// the title, properties (Month, Scope, Available now, Can pay now, Waiting
// for income, Not covered), a callout in a sentence or two, then a database
// of expense and savings lines. Default view: a Table grouped by coverage
// (Can pay now, Waiting for income, Not covered), each group in the chosen
// order (Recommended, Deadline, Priority, Smallest first or Manual, in the
// Sort menu), with the amount left summed per group. Rows: Mark paid,
// Postpone, Open. Board shows the coverage columns; a card can only be
// dragged to Postponed (which asks for a date).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, ListOrdered } from 'lucide-react';
import { useLogic, type PriorityRow, type PrioritiesLogic } from '@/src/logic/priorities/useLogic';
import { COVERAGE_LABEL } from '@/src/shared/budget/coverage';
import { Modal } from '@/src/widgets/Modal/Modal';
import { Database } from '@/src/widgets/Database/Database';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { monthLabel, remaining, type Occurrence } from '@/src/viewmodels/plans/model';
import type { SortMode } from '@/src/viewmodels/plans/priorities';
import { full } from './parts';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';
import styles from './Plans.module.css';

const REASONS = ['No money', 'Not urgent', 'Waiting on someone', 'Price changed'];
const GROUP_ORDER = ['now', 'waiting', 'not', 'postponed'];
const GROUP_LABEL: Record<string, string> = { ...COVERAGE_LABEL, postponed: 'Postponed' };
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'priority', label: 'Priority' },
  { id: 'smallest', label: 'Smallest first' },
  { id: 'mine', label: 'Manual' },
];

function CoverageCell({ row }: { row: PriorityRow }) {
  if (row.coverage === 'now') {
    return (
      <span className={styles.coverage} data-tone="good">
        <CheckCircle2 size={14} strokeWidth={2.25} aria-hidden /> Can pay now
      </span>
    );
  }
  if (row.coverage === 'waiting') {
    return (
      <span className={styles.coverage} data-tone="watch">
        <Clock size={14} strokeWidth={2.25} aria-hidden /> {row.waitsFor ? `Waits for ${row.waitsFor}` : 'Waiting for income'}
      </span>
    );
  }
  if (row.coverage === 'postponed') return <span className={styles.coverage}>Postponed</span>;
  return (
    <span className={styles.coverage} data-tone="bad">
      <AlertCircle size={14} strokeWidth={2.25} aria-hidden /> Not covered
    </span>
  );
}

function columns(v: PrioritiesLogic): ColumnDef<PriorityRow>[] {
  const buckets = [...new Set(v.rows.map((r) => r.o.bucketName))].map((b) => ({ value: b, label: b }));
  const list: ColumnDef<PriorityRow>[] = [
    { id: 'name', label: 'Name', type: 'text', width: 240, value: (r) => r.o.name },
    { id: 'bucket', label: 'Bucket', type: 'relation', width: 170, value: (r) => r.o.bucketName, options: buckets },
    {
      id: 'need',
      label: 'Need',
      type: 'select',
      width: 120,
      onCard: true,
      value: (r) => r.o.need,
      options: [
        { value: 'must', label: 'Must have' },
        { value: 'nice', label: 'Nice to have' },
      ],
    },
    { id: 'priority', label: 'Priority', type: 'select', width: 100, value: (r) => r.o.priority, options: ['High', 'Medium', 'Low'].map((p) => ({ value: p, label: p })) },
    { id: 'type', label: 'Type', type: 'select', width: 100, hidden: true, value: (r) => (r.o.kind === 'savings' ? 'Savings' : 'Expense'), options: [{ value: 'Expense', label: 'Expense' }, { value: 'Savings', label: 'Savings' }] },
    { id: 'due', label: 'Due', type: 'date', width: 110, value: (r) => r.o.due, onCard: true },
    { id: 'late', label: 'Days late', type: 'number', width: 100, value: (r) => r.daysLate, tone: (r) => (r.daysLate ? 'bad' : undefined) },
    { id: 'left', label: 'Amount left', type: 'currency', width: 130, value: (r) => r.left, calc: 'sum', onCard: true },
    { id: 'paidFrom', label: 'Paid from', type: 'text', width: 150, value: (r) => r.accountName || null },
    { id: 'coverage', label: 'Coverage', type: 'select', width: 210, onCard: true, value: (r) => r.coverage, options: GROUP_ORDER.map((k) => ({ value: k, label: GROUP_LABEL[k] })), render: (r) => <CoverageCell row={r} /> },
    { id: 'status', label: 'Status', type: 'select', width: 120, value: (r) => r.status, options: ['Open', 'Partly paid', 'Postponed'].map((s) => ({ value: s, label: s })) },
    { id: 'automation', label: 'Automation', type: 'text', width: 200, hidden: true, value: (r) => r.o.automationText ?? null },
  ];
  return list;
}

export function PrioritiesScreen() {
  const v = useLogic();
  const router = useRouter();
  const money = (n: number) => `${formatNumber(Math.round(n))} ${v.currency}`;
  const open = (o: Occurrence) => router.push(itemHref(o));

  return (
    <NotionPage
      title="Priorities"
      icon={<ListOrdered strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Priorities' }]}
      properties={[
        { id: 'month', label: 'Month', display: <MonthPicker value={v.month} onChange={v.setMonth} /> },
        {
          id: 'scope',
          label: 'Scope',
          edit: {
            type: 'select',
            value: v.view,
            options: [
              { value: 'month', label: 'This month' },
              { value: 'open', label: 'All open' },
            ],
            onSave: (next) => v.setView(next === 'open' ? 'open' : 'month'),
          },
        },
        { id: 'available', label: 'Available now', display: money(v.availableNow) },
        { id: 'now', label: 'Can pay now', display: money(v.totals.canPayNow) },
        { id: 'waiting', label: 'Waiting for income', display: money(v.totals.waiting) },
        { id: 'not', label: 'Not covered', display: <span className={bm.toneText} data-tone={v.totals.notCovered ? 'bad' : undefined}>{money(v.totals.notCovered)}</span> },
      ]}
    >
      <Callout tone={v.totals.notCovered ? 'bad' : v.totals.waiting ? 'watch' : undefined}>
        <p>{v.summary}</p>
      </Callout>
      {v.error && <p className={styles.error}>{v.error}</p>}
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <Database<PriorityRow>
          id="priorities"
          label={`What to pay in ${v.monthText}`}
          noun={['line', 'lines']}
          rows={v.rows}
          rowKey={(r) => r.key}
          columns={columns(v)}
          views={[
            { id: 'table', name: 'Table', layout: 'table' },
            { id: 'board', name: 'Board', layout: 'board' },
            { id: 'cards', name: 'Cards', layout: 'cards' },
          ]}
          groups={[
            { id: 'coverage', label: 'Coverage', key: (r) => ({ key: r.coverage, label: GROUP_LABEL[r.coverage] }), order: GROUP_ORDER },
            { id: 'need', label: 'Need', key: (r) => ({ key: r.o.need, label: r.o.need === 'must' ? 'Must have' : 'Nice to have' }) },
            { id: 'bucket', label: 'Bucket', key: (r) => ({ key: r.o.bucketId, label: r.o.bucketName }) },
          ]}
          defaultGroup="coverage"
          subtotalColumn="left"
          currency={v.currency}
          sortPresets={SORTS.map((s) => ({ id: s.id, label: s.label, compare: v.sortWith(s.id) }))}
          card={{ title: (r) => r.o.name }}
          list={{
            title: (r) => r.o.name,
            secondary: (r) => [r.o.bucketName, r.o.need === 'must' ? 'Must have' : null].filter(Boolean).join(' · '),
            amount: (r) => formatNumber(r.left),
            status: (r) => <CoverageCell row={r} />,
          }}
          board={{
            group: 'coverage',
            onMove: (r, to) => {
              if (to === 'postponed') {
                v.setPostponing(r.o);
                return;
              }
              throw new Error('Coverage follows the money received and expected, so it can’t be changed by moving a card. Mark it paid or postpone it instead.');
            },
            header: (key, rows) => `${formatNumber(rows.reduce((s, r) => s + r.left, 0))} ${v.currency}`,
          }}
          rowActions={[
            { id: 'paid', label: 'Mark paid', run: (r) => v.setPaying(r.o) },
            { id: 'postpone', label: 'Postpone', run: (r) => v.setPostponing(r.o) },
          ]}
          onOpen={(r) => open(r.o)}
          emptyText="Nothing left to pay in this scope."
        />
      )}
      {v.paying && <PaySheet v={v} item={v.paying} />}
      {v.postponing && <PostponeSheet v={v} item={v.postponing} />}
    </NotionPage>
  );
}

function itemHref(o: Occurrence) {
  return `/budget/item/${o.bucketId}/${o.itemId}?month=${o.month}`;
}

function PaySheet({ v, item }: { v: PrioritiesLogic; item: Occurrence }) {
  const wallets = v.walletsFor(item);
  const [amount, setAmount] = useState(String(Math.round(remaining(item))));
  const [account, setAccount] = useState(wallets[0]?.id ?? '');
  const value = Number(amount);
  return (
    <Modal title={`Mark “${item.name}” paid`} onClose={() => v.setPaying(null)}>
      <div className={styles.form}>
        <label className={styles.field}>
          Amount ({v.currency}) · {full(remaining(item))} left
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className={styles.field}>
          Paid from
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {wallets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {value > 0 && value < remaining(item) - 0.5 && <p className={styles.muted}>Partial: the rest stays open.</p>}
        {v.error && <p className={styles.error}>{v.error}</p>}
        <div className={styles.sheetActions}>
          <button type="button" className={styles.ghost} onClick={() => v.setPaying(null)}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={!(value > 0) || !account || v.busy} onClick={() => v.pay(item, value, account)}>
            {v.busy ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PostponeSheet({ v, item }: { v: PrioritiesLogic; item: Occurrence }) {
  const base = item.due ?? v.today;
  const next = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
  const [date, setDate] = useState(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  const [reason, setReason] = useState(REASONS[0]);
  return (
    <Modal title={item.recurring ? `Skip “${item.name}” this month?` : `Postpone “${item.name}”`} onClose={() => v.setPostponing(null)}>
      <div className={styles.form}>
        {item.recurring ? (
          <p className={styles.muted}>Skips {monthLabel(item.month, true)} only.</p>
        ) : (
          <label className={styles.field}>
            New date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <div className={styles.reasons} role="group" aria-label="Why">
          {REASONS.map((r) => (
            <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        {v.error && <p className={styles.error}>{v.error}</p>}
        <div className={styles.sheetActions}>
          <button type="button" className={styles.ghost} onClick={() => v.setPostponing(null)}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={v.busy || (!item.recurring && !date)} onClick={() => v.postpone(item, new Date(`${date}T12:00`), reason)}>
            {v.busy ? 'Saving…' : item.recurring ? 'Skip this month' : 'Postpone'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
