'use client';

// Debt: a Notion page, full width.
//   Properties: Total owed, High priority, Next payment, Repaid this year,
//   Borrowed this year, Debts; Borrowed (all time) and Repaid (all time)
//   behind "Show more".
//   A callout: "You owe 3,971,122. The next payment is 50,000 to Momokash
//   on 28 Sep, now 5 days late."
//   Blocks: is my debt going down (total owed by month), where is my debt
//   (one stacked bar by priority) and borrowed vs repaid (bars by month).
//   Then the debts database (Table and Cards) with "New debt".

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HandCoins } from 'lucide-react';
import { useLogic } from '@/src/logic/debtsList/useLogic';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { debtSentence } from '@/src/viewmodels/debt';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { ChartBlock } from '@/src/widgets/Database/ChartBlock';
import { MasonryGrid } from '@/src/widgets/Database/MasonryGrid';
import { Database } from '@/src/widgets/Database/Database';
import { CompactProgress } from '@/src/widgets/Database/PropertiesBlock';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { Money, formatMoney } from '@/src/widgets/Money/Money';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Tag, type TagColor } from '@/src/widgets/TaskDb/Tag';
import styles from './DebtsListScreen.module.css';

type DebtRow = ReturnType<typeof useLogic>['debts'][number];

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const PRIORITY_COLOR: Record<DebtRow['priority'], TagColor> = { high: 'red', medium: 'yellow', low: 'gray' };
const PRIORITY_FILL = { high: '#d44c47', medium: '#cb912f', low: '#9b9a97' } as const;
const TYPE_LABEL = { cash: 'Cash', existing: 'Existing' } as const;

const shortDate = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export function DebtsListScreen() {
  const v = useLogic();
  const router = useRouter();
  const [hidden] = useAmountsHidden();
  const [archiving, setArchiving] = useState<DebtRow | null>(null);
  const fmt = (n: number) => (hidden ? HIDDEN_AMOUNT : formatMoney(n));
  const axis = (n: number) => (hidden ? '' : Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const s = v.debtSummary;
  const today = new Date();

  const next = useMemo(
    () => [...v.debts].filter((d) => d.nextPaymentDate && d.balance > 0).sort((a, b) => a.nextPaymentDate!.getTime() - b.nextPaymentDate!.getTime())[0] ?? null,
    [v.debts]
  );
  const nextLate = next ? next.nextPaymentDate! < new Date(today.getFullYear(), today.getMonth(), today.getDate()) : false;
  const sentence = debtSentence(s.totalDebt, next ? { name: next.name, amount: next.nextPaymentAmount, date: next.nextPaymentDate! } : null, today, fmt);

  const columns: ColumnDef<DebtRow>[] = [
    { id: 'name', label: 'Name', type: 'text', width: 200, value: (d) => d.name },
    { id: 'type', label: 'Type', type: 'select', width: 110, value: (d) => d.debtType, options: [{ value: 'cash', label: 'Cash' }, { value: 'existing', label: 'Existing' }] },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      width: 110,
      value: (d) => d.priority,
      options: (['high', 'medium', 'low'] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
      render: (d) => <Tag color={PRIORITY_COLOR[d.priority]}>{PRIORITY_LABEL[d.priority]}</Tag>,
    },
    { id: 'borrowed', label: 'Borrowed', type: 'currency', width: 130, value: (d) => d.principal, calc: 'sum' },
    { id: 'repaid', label: 'Repaid', type: 'currency', width: 130, value: (d) => d.repaid, calc: 'sum' },
    { id: 'balance', label: 'Balance', type: 'currency', width: 130, value: (d) => d.balance, calc: 'sum', onCard: true },
    { id: 'progress', label: 'Progress', type: 'progress', width: 160, value: (d) => d.percent / 100, render: (d) => <CompactProgress value={d.percent / 100} />, onCard: true },
    {
      id: 'next',
      label: 'Next payment',
      type: 'date',
      width: 140,
      value: (d) => d.nextPaymentDate,
      tone: (d) => (d.nextPaymentDate && d.nextPaymentDate < today && d.balance > 0 ? 'bad' : undefined),
      onCard: true,
    },
    { id: 'plan', label: 'Payment plan', type: 'text', width: 150, value: (d) => d.planText, render: (d) => (d.planText ? <span>{hidden ? HIDDEN_AMOUNT : d.planText}</span> : null) },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 110,
      value: (d) => (d.balance <= 0 ? 'Repaid' : d.nextPaymentDate && d.nextPaymentDate < today ? 'Late' : 'Active'),
      options: ['Active', 'Late', 'Repaid'].map((x) => ({ value: x, label: x })),
      render: (d) => {
        const st = d.balance <= 0 ? 'Repaid' : d.nextPaymentDate && d.nextPaymentDate < today ? 'Late' : 'Active';
        return <Tag color={st === 'Repaid' ? 'green' : st === 'Late' ? 'red' : 'blue'}>{st}</Tag>;
      },
    },
    { id: 'started', label: 'Started', type: 'date', width: 120, hidden: true, value: (d) => d.startDate },
  ];

  const priorities = (['high', 'medium', 'low'] as const).filter((p) => s.byPriority[p] > 0);
  const firstWithDebt = Math.max(0, v.totalDebtTrend.findIndex((p) => p.total > 0));
  const trend = v.totalDebtTrend.slice(firstWithDebt);

  return (
    <NotionPage
      title="Debt"
      icon={<HandCoins strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Debt', href: '/debts' }]}
      menu={[{ label: 'New debt', href: '/debts/new' }]}
      properties={[
        { id: 'owed', label: 'Total owed', tone: s.totalDebt > 0 ? 'bad' : 'good', display: <Money value={s.totalDebt} currency={v.currency} /> },
        { id: 'high', label: 'High priority', tone: s.byPriority.high > 0 ? 'watch' : 'neutral', display: <Money value={s.byPriority.high} /> },
        {
          id: 'next',
          label: 'Next payment',
          tone: nextLate ? 'bad' : 'neutral',
          display: next ? shortDate(next.nextPaymentDate) : 'No plan set',
          sub: next ? (
            <>
              {next.nextPaymentAmount ? <Money value={next.nextPaymentAmount} /> : null} to {next.name}
              {nextLate ? ', late' : ''}
            </>
          ) : undefined,
        },
        { id: 'repaidYear', label: 'Repaid this year', tone: 'good', display: <Money value={v.repaidThisYear} /> },
        { id: 'borrowedYear', label: 'Borrowed this year', tone: 'in', display: <Money value={v.borrowedThisYear} /> },
        { id: 'count', label: 'Debts', display: String(s.debtCount) },
        { id: 'borrowedAll', label: 'Borrowed (all time)', display: <Money value={s.totalFinanced} /> },
        { id: 'repaidAll', label: 'Repaid (all time)', display: <Money value={s.totalRefunded} /> },
        { id: 'cash', label: 'Cash debts', display: <Money value={s.byType.cash} />, sub: 'Borrowed money that landed in an account' },
        { id: 'existing', label: 'Existing debts', display: <Money value={s.byType.existing} />, sub: 'Loans that were already there' },
      ]}
    >
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <>
          <Callout tone={nextLate ? 'bad' : s.totalDebt > 0 ? 'watch' : 'good'}>
            <p>{sentence}</p>
          </Callout>

          {v.debts.length > 0 && (
            <div className={styles.charts}>
              <MasonryGrid
                label="Debt charts"
                items={[
                  {
                    id: 'trend',
                    node: (
                      <ChartBlock id="trend" title="Is my debt going down?" summary={trend.length > 1 ? `${trend[trend.length - 1].total < trend[0].total ? 'Down' : 'Up'} from ${fmt(trend[0].total)} in ${trend[0].label} to ${fmt(trend[trend.length - 1].total)} now.` : null} empty={trend.length < 2 ? 'Needs two months of history.' : null}>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                            <CartesianGrid vertical={false} stroke="#edf0f6" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={48} tickFormatter={axis} />
                            <Tooltip formatter={(n) => fmt(Number(n ?? 0))} />
                            <Line dataKey="total" name="Owed" stroke="#c62f3e" strokeWidth={2.5} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </ChartBlock>
                    ),
                  },
                  {
                    id: 'priority',
                    node: (
                      <ChartBlock id="priority" title="Where is my debt?" summary={priorities.length ? `${PRIORITY_LABEL[priorities[0]]} priority holds ${Math.round((s.byPriority[priorities[0]] / Math.max(1, s.totalDebt)) * 100)}% of it.` : null}>
                        <div className={styles.stacked} role="img" aria-label="Debt by priority">
                          {priorities.map((p) => (
                            <span key={p} style={{ flexGrow: s.byPriority[p], background: PRIORITY_FILL[p] }} title={`${PRIORITY_LABEL[p]}: ${fmt(s.byPriority[p])}`} />
                          ))}
                        </div>
                        <ul className={styles.stackLegend}>
                          {priorities.map((p) => (
                            <li key={p}>
                              <span className={styles.swatch} style={{ background: PRIORITY_FILL[p] }} aria-hidden />
                              {PRIORITY_LABEL[p]}
                              <strong>{fmt(s.byPriority[p])}</strong>
                            </li>
                          ))}
                        </ul>
                      </ChartBlock>
                    ),
                  },
                  {
                    id: 'flow',
                    node: (
                      <ChartBlock id="flow" title="Borrowed vs repaid" summary={`${fmt(v.repaidThisYear)} repaid and ${fmt(v.borrowedThisYear)} borrowed this year.`}>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={v.monthly} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                            <CartesianGrid vertical={false} stroke="#edf0f6" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={48} tickFormatter={axis} />
                            <Tooltip formatter={(n) => fmt(Number(n ?? 0))} />
                            <Bar dataKey="borrowed" name="Borrowed" fill="#3965fa" />
                            <Bar dataKey="repaid" name="Repaid" fill="#448361" />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartBlock>
                    ),
                  },
                ]}
              />
            </div>
          )}

          <Database<DebtRow>
            id="money.debts"
            label="Debts"
            noun={['debt', 'debts']}
            rows={v.debts}
            rowKey={(d) => d.id}
            columns={columns}
            views={[
              { id: 'table', name: 'Table', layout: 'table' },
              { id: 'cards', name: 'Cards', layout: 'cards' },
            ]}
            groups={[
              { id: 'priority', label: 'Priority', key: (d) => ({ key: d.priority, label: PRIORITY_LABEL[d.priority] }), order: ['high', 'medium', 'low'] },
              { id: 'type', label: 'Type', key: (d) => ({ key: d.debtType, label: TYPE_LABEL[d.debtType] }) },
            ]}
            defaultGroup="none"
            subtotalColumn="balance"
            currency={v.currency}
            card={{ title: (d) => d.name, progress: (d) => ({ value: d.percent / 100 }) }}
            rowActions={[
              { id: 'repay', label: 'Record a repayment', show: (d) => d.balance > 0, run: (d) => router.push(`/debts/${d.id}/repay`) },
              { id: 'plan', label: 'Payment plan', run: (d) => router.push(`/debts/${d.id}/plan`) },
              { id: 'archive', label: 'Archive', run: (d) => setArchiving(d) },
            ]}
            onOpen={(d) => router.push(`/debts/${d.id}`)}
            onNew={() => router.push('/debts/new')}
            newLabel="New debt"
            emptyText="No debts. Nice."
          />
        </>
      )}
      {archiving && (
        <ConfirmDialog
          title={`Archive ${archiving.name}?`}
          message="It leaves the list and the totals. Its repayments stay in your transactions."
          confirmLabel="Archive"
          cancelLabel="Keep"
          onCancel={() => setArchiving(null)}
          onConfirm={() => {
            const d = archiving;
            setArchiving(null);
            void v.archiveDebt(d.id);
          }}
        />
      )}
    </NotionPage>
  );
}
