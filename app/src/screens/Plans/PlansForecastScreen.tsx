'use client';

// Plan and forecast — a page, on every screen size:
//   1. Where do I stand today? A callout and four blocks: cash in accounts
//      (with a per-account table), savings, still expected this month,
//      still to pay this month (of which overdue).
//   2. Plan the next months: a board with a column per month in the
//      horizon (and Unscheduled), the month's income as a fixed header and
//      its figures (expected income, planned out, left, daily for variable
//      spending). Moving, re-pricing, splitting or dropping a line changes
//      a DRAFT; "Apply plan" writes it, "Discard draft" resets it.
//   3. How much can I spend each day? The daily allowance and the cash-safe
//      amount, today, this week, and the month's spending against the path.
//   4. Where is this heading? The running balance, month by month, and plans
//      on schedule.
// While a draft exists, every figure shows the draft, labelled "draft".

import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';
import { useLogic, type PlanForecastLogic } from '@/src/logic/plansForecast/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { monthLabel } from '@/src/viewmodels/plans/model';
import { SCENARIO_FACTOR, UNSCHEDULED, type PlanLine, type PlanScenario } from '@/src/viewmodels/plans/planDraft';
import { Block, Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useScopeChooser } from '@/src/screens/BudgetMonth/ScopeChooser';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';
import styles from './PlanForecast.module.css';

const money = (n: number) => formatNumber(Math.round(n));
const SCENARIO_LABEL: Record<PlanScenario, string> = { cautious: 'Cautious', expected: 'Expected', optimistic: 'Optimistic' };
const STATUS = { on_track: { label: 'On track', tone: 'good' }, watch: { label: 'Watch', tone: 'watch' }, off_track: { label: 'Off track', tone: 'bad' } } as const;

function Draft({ on }: { on: boolean }) {
  return on ? <span className={styles.draft}>draft</span> : null;
}

function Figure({ label, value, sub, tone, draft }: { label: string; value: string; sub?: ReactNode; tone?: 'bad'; draft?: boolean }) {
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>
        {label} <Draft on={Boolean(draft)} />
      </span>
      <strong data-tone={tone}>{value}</strong>
      {sub && <span className={styles.figureSub}>{sub}</span>}
    </div>
  );
}

export function PlansForecastScreen() {
  const v = useLogic();
  const scope = useScopeChooser();
  const compact = useLayout().deviceClass === 'compact';
  const [perAccount, setPerAccount] = useState(false);
  const [editing, setEditing] = useState<{ kind: 'amount' | 'split' | 'account'; line: PlanLine } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const c = v.currency;
  const draft = v.hasDraft;

  const monthName = (m: string) => monthLabel(m, true).split(' ')[0];
  const nowName = monthName(v.current);

  const lineColumns: ColumnDef<PlanLine>[] = [
    { id: 'name', label: 'Name', type: 'text', width: 220, value: (l) => l.name },
    { id: 'bucket', label: 'Bucket', type: 'text', width: 160, value: (l) => l.bucketName, onCard: true },
    { id: 'amount', label: 'Amount', type: 'currency', width: 120, value: (l) => l.amount, calc: 'sum', onCard: true },
    { id: 'need', label: 'Need', type: 'select', width: 120, value: (l) => l.need, options: [{ value: 'must', label: 'Must have' }, { value: 'nice', label: 'Nice to have' }], onCard: true },
    { id: 'due', label: 'Due', type: 'date', width: 110, value: (l) => l.due, onCard: true },
    { id: 'month', label: 'Month', type: 'text', width: 130, value: (l) => (l.month ? monthLabel(l.month, true) : 'Unscheduled') },
    { id: 'paidFrom', label: 'Paid from', type: 'text', width: 140, value: (l) => v.accounts.find((a) => a.id === l.accountId)?.name ?? null, onCard: true },
    {
      id: 'flags',
      label: 'Changes',
      type: 'text',
      width: 160,
      noQuery: true,
      onCard: true,
      value: (l) => [l.changed ? 'draft' : null, ...(l.warnings ?? [])].filter(Boolean).join(', ') || null,
      render: (l) => (
        <span className={styles.flags}>
          {l.changed && <span className={styles.draft}>draft</span>}
          {(l.warnings ?? []).map((w) => (
            <span key={w} className={bm.chip} data-tone="watch">
              {w}
            </span>
          ))}
        </span>
      ),
    },
  ];

  const columnKeys = [...v.months, UNSCHEDULED];

  async function moveLine(line: PlanLine, to: string) {
    const toMonth = to === UNSCHEDULED ? null : to;
    if (line.recurring && line.month) {
      const choice = await scope.ask(line.name, line.month);
      if (!choice) return;
      await v.move(line.key, toMonth, choice);
    } else {
      await v.move(line.key, toMonth);
    }
  }

  const draftBar = draft && (
    <div className={styles.draftActions} data-compact={compact || undefined}>
      <span>
        Draft with {v.changes.length} {v.changes.length === 1 ? 'change' : 'changes'}
      </span>
      <button type="button" className={bm.ghostButton} onClick={() => void v.discard()} disabled={v.applying}>
        Discard draft
      </button>
      <button type="button" className={bm.primaryButton} onClick={() => void v.apply()} disabled={v.applying}>
        {v.applying ? 'Applying…' : 'Apply plan'}
      </button>
    </div>
  );

  return (
    <NotionPage
      title="Plan and forecast"
      icon={<TrendingUp strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Plan and forecast' }]}
      properties={[
        {
          id: 'horizon',
          label: 'Planning horizon',
          edit: {
            type: 'select',
            value: String(v.horizon),
            options: [
              { value: '2', label: 'This month and next' },
              { value: '3', label: 'This month and the next two' },
            ],
            onSave: (next) => v.setHorizon(next === '3' ? 3 : 2),
          },
        },
        {
          id: 'scenario',
          label: 'Scenario',
          edit: {
            type: 'select',
            value: v.scenario,
            options: (Object.keys(SCENARIO_FACTOR) as PlanScenario[]).map((s) => ({ value: s, label: SCENARIO_LABEL[s] })),
            onSave: (next) => v.setScenario(next as PlanScenario),
          },
        },
        {
          id: 'status',
          label: 'Plan status',
          display: draft ? (
            <span className={bm.chip} data-tone="watch">
              Draft with {v.changes.length} {v.changes.length === 1 ? 'change' : 'changes'}
            </span>
          ) : (
            'No changes'
          ),
        },
        { id: 'applied', label: 'Last applied', display: v.lastApplied ? v.lastApplied.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null },
      ]}
    >
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <>
          {v.error && (
            <Callout tone="bad" icon={<AlertTriangle size={18} strokeWidth={2} />}>
              <p>{v.error}</p>
            </Callout>
          )}

          {/* 1 */}
          <Block title="Where do I stand today?">
            <Callout>
              <p>
                You have {money(v.cash)} in your accounts and {money(v.savings)} in savings. {money(v.stillToPay)} is still to pay this month and {money(v.stillExpected)} is still
                expected. If everything arrives, you&apos;ll end {nowName} with about {money(v.endOfMonth)}.{draft ? ' These figures include your draft.' : ''}
              </p>
            </Callout>
            <div className={styles.standRow}>
              <div className={styles.standBlock}>
                <Figure label="Cash in accounts" value={`${money(v.cash)} ${c}`} />
                <button type="button" className={styles.toggle} aria-expanded={perAccount} onClick={() => setPerAccount((p) => !p)}>
                  {perAccount ? 'Hide accounts' : 'Per account'}
                </button>
                {perAccount && (
                  <table className={styles.smallTable}>
                    <tbody>
                      {v.perAccount.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {a.name}
                            {a.savings ? ' (savings)' : ''}
                          </td>
                          <td data-num>{money(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className={styles.standBlock}>
                <Figure label="Savings" value={`${money(v.savings)} ${c}`} />
              </div>
              <div className={styles.standBlock}>
                <Figure label="Still expected this month" value={`${money(v.stillExpected)} ${c}`} sub={v.expectedNow.map((i) => i.name).join(', ') || 'Nothing else expected'} />
              </div>
              <div className={styles.standBlock}>
                <Figure label="Still to pay this month" value={`${money(v.stillToPay)} ${c}`} sub={`of which ${money(v.overdue)} overdue`} tone={v.overdue ? 'bad' : undefined} draft={draft} />
              </div>
            </div>
          </Block>

          {/* 2 */}
          <Block title="Plan the next months" actions={compact ? null : draftBar}>
            <Database<PlanLine>
              id="plan.board"
              label="Plan the next months"
              noun={['line', 'lines']}
              rows={v.applied}
              rowKey={(l) => l.key}
              columns={lineColumns}
              views={[
                { id: 'board', name: 'Board', layout: 'board' },
                { id: 'table', name: 'Table', layout: 'table', group: 'month' },
              ]}
              groups={[
                {
                  id: 'month',
                  label: 'Month',
                  key: (l) => ({ key: l.month ?? UNSCHEDULED, label: l.month ? monthLabel(l.month, true) : 'Unscheduled' }),
                  order: columnKeys,
                },
              ]}
              defaultGroup="month"
              subtotalColumn="amount"
              currency={c}
              card={{
                title: (l) => l.name,
              }}
              board={{
                group: 'month',
                onMove: (l, to) => moveLine(l, to),
                header: (key) => {
                  if (key === UNSCHEDULED) return <span>Lines without a date, or moved out of the plan</span>;
                  const col = v.columns.find((x) => x.month === key);
                  if (!col) return null;
                  const income = v.income.filter((i) => i.month === key);
                  return (
                    <span className={styles.colHead}>
                      {income.length > 0 && (
                        <span className={styles.colIncome}>
                          {income.map((i) => (
                            <span key={i.key}>
                              {i.name} <strong>{money(i.amount)}</strong>
                            </span>
                          ))}
                        </span>
                      )}
                      <span>
                        Expected income <strong>{money(col.expectedIncome)}</strong>
                      </span>
                      <span>
                        Planned out <strong>{money(col.plannedOut)}</strong> <Draft on={draft} />
                      </span>
                      <span>
                        Left <strong data-tone={col.left < 0 ? 'bad' : undefined}>{money(col.left)}</strong>
                      </span>
                      <span>
                        Daily for variable spending <strong>{money(col.daily)}</strong>
                      </span>
                    </span>
                  );
                },
                actions: [
                  { id: 'amount', label: 'Change amount', run: (l) => setEditing({ kind: 'amount', line: l }) },
                  { id: 'split', label: 'Split across months', show: (l) => l.month !== null, run: (l) => setEditing({ kind: 'split', line: l }) },
                  { id: 'account', label: 'Change paid from', run: (l) => setEditing({ kind: 'account', line: l }) },
                  { id: 'drop', label: 'Drop', run: (l) => v.drop(l.key) },
                ],
              }}
              emptyText="Nothing left to plan in these months."
            />
          </Block>

          {/* 3 */}
          {v.guide && (
            <Block
              title="How much can I spend each day?"
              actions={
                <span className={bm.chip} data-tone={STATUS[v.guide.status].tone}>
                  {STATUS[v.guide.status].label}
                </span>
              }
            >
              <Callout tone={v.guide.status === 'off_track' ? 'bad' : v.guide.status === 'watch' ? 'watch' : undefined}>
                <p>
                  Keep to about <strong>{money(v.guide.follow)} {c}</strong> a day for variable spending for the rest of {nowName} ({v.guide.daysLeft} {v.guide.daysLeft === 1 ? 'day' : 'days'} left).
                  {v.guide.followReason === 'cash'
                    ? ` That's the cash-safe amount: your variable budget allows ${money(v.guide.allowance)} a day, but the money you have and expect only covers ${money(v.guide.safePerDay)} once the bills are paid.`
                    : ` Your money covers ${money(v.guide.safePerDay)} a day once the bills are paid, so the budget is the limit.`}
                  {v.guide.message ? ` ${v.guide.message}` : ''}
                </p>
              </Callout>
              <div className={styles.standRow}>
                <div className={styles.standBlock}>
                  <Figure label="Allowed today" value={money(v.guide.today.allowance)} draft={draft} />
                </div>
                <div className={styles.standBlock}>
                  <Figure label="Spent today" value={money(v.guide.today.spent)} />
                </div>
                <div className={styles.standBlock}>
                  <Figure label="Left today" value={money(v.guide.today.left)} tone={v.guide.today.left < 0 ? 'bad' : undefined} />
                </div>
                <div className={styles.standBlock}>
                  <Figure
                    label={`This week (${v.guide.week.days} ${v.guide.week.days === 1 ? 'day' : 'days'})`}
                    value={`${money(v.guide.week.spent)} of ${money(v.guide.week.allowance)}`}
                    sub={v.guide.week.difference >= 0 ? `${money(v.guide.week.difference)} under` : `${money(-v.guide.week.difference)} over`}
                    tone={v.guide.week.difference < 0 ? 'bad' : undefined}
                  />
                </div>
              </div>
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height={compact ? 220 : 260}>
                  <LineChart data={v.guide.path} margin={{ top: 12, right: 72, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#edf0f6" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={compact ? 6 : 3} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={56} tickFormatter={(n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))} />
                    <Tooltip formatter={(value) => money(Number(value ?? 0))} labelFormatter={(d) => `${nowName} ${d}`} />
                    <Line dataKey="allowance" name="Allowance path" stroke="#a5a49f" strokeDasharray="6 4" dot={false} strokeWidth={2} />
                    <Line dataKey="spent" name="Spent so far" stroke="#3965fa" dot={false} strokeWidth={2.5} connectNulls={false} />
                    <ReferenceLine x={v.today.getDate()} stroke="#37352f" strokeDasharray="2 3" label={{ value: 'Today', position: 'top', fontSize: 11, fill: '#37352f' }} />
                  </LineChart>
                </ResponsiveContainer>
                <p className={styles.legend}>
                  <span data-kind="spent">Variable spending so far</span>
                  <span data-kind="path">Allowance path</span>
                </p>
              </div>
              {v.columns.length > 1 && (
                <p className={styles.note}>
                  Planned daily allowance:{' '}
                  {v.columns
                    .slice(1)
                    .map((col) => `${monthName(col.month)} ${money(col.daily)}`)
                    .join(', ')}
                  {draft ? ' (draft)' : ''}.
                </p>
              )}
            </Block>
          )}

          {/* 4 */}
          <Block title="Where is this heading?">
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height={compact ? 200 : 240}>
                <LineChart data={v.forecast.map((f) => ({ ...f, label: monthLabel(f.month) }))} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#edf0f6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={compact ? 1 : 0} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={56} tickFormatter={(n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(n))} />
                  <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                  <ReferenceLine y={0} stroke="#d6404f" strokeDasharray="3 3" />
                  <Line dataKey="balanceAfter" name="Balance after" stroke="#3965fa" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {compact ? (
              <ul className={styles.monthList}>
                {v.forecast.map((f) => (
                  <li key={f.month}>
                    <button type="button" aria-expanded={expanded === f.month} onClick={() => setExpanded((e) => (e === f.month ? null : f.month))}>
                      <span>{monthLabel(f.month, true)}</span>
                      <strong data-tone={f.left < 0 ? 'bad' : 'good'}>{money(f.left)}</strong>
                      <span>{money(f.balanceAfter)}</span>
                    </button>
                    {expanded === f.month && (
                      <p>
                        Expected income {money(f.expectedIncome)} · Planned out {money(f.plannedOut)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th data-num>Expected income</th>
                    <th data-num>Planned out</th>
                    <th data-num>Left</th>
                    <th data-num>Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {v.forecast.map((f) => (
                    <tr key={f.month}>
                      <td>
                        {monthLabel(f.month, true)} {v.months.includes(f.month) && <Draft on={draft} />}
                      </td>
                      <td data-num>{money(f.expectedIncome)}</td>
                      <td data-num>{money(f.plannedOut)}</td>
                      <td data-num data-tone={f.left < 0 ? 'bad' : undefined}>
                        {money(f.left)}
                      </td>
                      <td data-num>{money(f.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={styles.note} title="Expected income minus planned expenses and savings, added up over the planning horizon. It's what the plan leaves unassigned, not cash you'll have on one day.">
              Left over the period <strong data-tone={v.leftOverPeriod < 0 ? 'bad' : undefined}>{money(v.leftOverPeriod)} {c}</strong>{' '}
              <Info size={13} strokeWidth={2} aria-hidden /> <span className={styles.noteMuted}>expected income minus planned expenses and savings across the planning horizon</span>
            </p>

            {v.schedule.length > 0 && (
              <>
                <h3 className={styles.subTitle}>Plans on schedule</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th data-num>Remaining</th>
                      <th>Target end</th>
                      <th>Forecast end</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.schedule.map((p) => (
                      <tr key={p.bucketId}>
                        <td>{p.name}</td>
                        <td data-num>{money(p.remaining)}</td>
                        <td>{p.targetEnd ? monthLabel(p.targetEnd, true) : ''}</td>
                        <td data-tone={p.monthsLate > 0 ? 'bad' : undefined}>{p.forecastEnd ? monthLabel(p.forecastEnd, true) : 'Beyond the forecast'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Block>

          {compact && draftBar}
        </>
      )}

      {editing && <EditSheet v={v} kind={editing.kind} line={editing.line} onClose={() => setEditing(null)} />}
      {scope.dialog}
    </NotionPage>
  );
}

function EditSheet({ v, kind, line, onClose }: { v: PlanForecastLogic; kind: 'amount' | 'split' | 'account'; line: PlanLine; onClose: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(line.amount)));
  const [first, setFirst] = useState(String(Math.round(line.amount / 2)));
  const [account, setAccount] = useState(line.accountId ?? '');
  const nextMonth = line.month ? v.months[v.months.indexOf(line.month) + 1] ?? null : null;
  const n = (s: string) => Number(s.replace(/[\s,]/g, ''));
  return (
    <Modal title={kind === 'amount' ? `Amount for ${line.name}` : kind === 'split' ? `Split ${line.name}` : `Pay ${line.name} from`} onClose={onClose}>
      <div className={styles.form}>
        {kind === 'amount' && (
          <label>
            Amount ({v.currency})
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
        )}
        {kind === 'split' &&
          (nextMonth ? (
            <>
              <label>
                In {monthLabel(line.month!, true)}
                <input inputMode="decimal" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
              </label>
              <p className={styles.noteMuted}>
                The rest, {Math.round(line.amount - n(first)).toLocaleString('en-US')}, moves to {monthLabel(nextMonth, true)}.
              </p>
            </>
          ) : (
            <p className={styles.noteMuted}>Choose a longer planning horizon to split this across months.</p>
          ))}
        {kind === 'account' && (
          <label>
            Paid from
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Choose account</option>
              {v.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className={styles.formActions}>
          <button type="button" className={bm.ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={bm.primaryButton}
            disabled={(kind === 'amount' && !(n(amount) >= 0)) || (kind === 'split' && (!nextMonth || !(n(first) > 0 && n(first) < line.amount))) || (kind === 'account' && !account)}
            onClick={async () => {
              if (kind === 'amount') await v.setAmount(line.key, n(amount));
              if (kind === 'split' && nextMonth) await v.split(line.key, [{ month: line.month!, amount: n(first) }, { month: nextMonth, amount: Math.round(line.amount - n(first)) }]);
              if (kind === 'account') await v.setAccount(line.key, account);
              onClose();
            }}
          >
            Save to draft
          </button>
        </div>
      </div>
    </Modal>
  );
}
