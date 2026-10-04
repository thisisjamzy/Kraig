'use client';

// Finance Insights: the Forecast — horizon, scenario, the chart (projected
// income and expenses with their range, the gap line, optional running
// balance; the current month split into actual so far + the rest), the gap
// table, "what if" items, and generated guidance.

import { useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, ErrorBar, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceInsights } from '@/src/logic/financeInsights/useLogic';
import { monthName, shiftMonthKey, monthKey } from '@/src/viewmodels/finance/ranges';
import { AXIS_TICK, COLORS, Legend, Pills, TooltipBox, compact, full } from '@/src/phone/screens/FinanceInsights/parts';
import styles from '@/src/phone/screens/FinanceInsights/FinanceInsights.module.css';

export function ForecastSection({ v }: { v: FinanceInsights }) {
  const f = v.projection;
  const c = v.currency;
  const [balanceLine, setBalanceLine] = useState(false);
  const [adding, setAdding] = useState(false);
  const rows = f.months.map((m) => ({
    ...m,
    label: m.current ? `${m.label} (now)` : m.label,
    incomeActual: m.actualIncome,
    incomeRest: Math.max(0, m.income - m.actualIncome),
    expenseActual: m.actualExpense,
    expenseRest: Math.max(0, m.expense - m.actualExpense),
    incomeErr: [m.income - m.incomeLow, m.incomeHigh - m.income],
    expenseErr: [m.expense - m.expenseLow, m.expenseHigh - m.expense],
    gapUp: m.gap >= 0 ? m.gap : null,
    gapDown: m.gap < 0 ? m.gap : null,
  }));

  return (
    <>
      <div className={styles.controls}>
        <Pills
          label="Forecast horizon"
          small
          value={String(v.horizon)}
          onChange={(x) => v.setHorizon(Number(x))}
          options={[3, 4, 6, 12].map((n) => ({ value: String(n), label: `${n} months` }))}
        />
        <Pills
          label="Scenario"
          small
          value={v.scenario}
          onChange={v.setScenario}
          options={[
            { value: 'cautious', label: 'Cautious' },
            { value: 'expected', label: 'Expected' },
            { value: 'optimistic', label: 'Optimistic' },
          ]}
        />
      </div>
      {f.lowConfidence && (
        <p className={styles.lowConfidence}>
          Low confidence: only {f.historyMonths} {f.historyMonths === 1 ? 'month' : 'months'} of history so far.
        </p>
      )}

      <ComposedChart responsive style={{ width: '100%', height: 240 }} data={rows} margin={{ top: 12, right: 4, bottom: 0, left: -6 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
        <ReferenceLine y={0} stroke="var(--fi-light)" />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
            if (!p) return null;
            return (
              <TooltipBox
                active={active}
                title={`${monthName(p.month)}${p.current ? ' (actual so far + rest)' : ''}`}
                rows={[
                  { label: 'Projected income', value: `${full(p.income, c)}`, color: COLORS.income },
                  ...(p.incomeEstimated > 0 ? [{ label: '  of which estimated', value: full(p.incomeEstimated, c) }] : []),
                  { label: 'Projected expenses', value: full(p.expense, c), color: COLORS.expense },
                  { label: 'Range (expenses)', value: `${full(p.expenseLow)} – ${full(p.expenseHigh)}` },
                  { label: 'Planned savings', value: full(p.savings, c) },
                  { label: 'Gap', value: full(p.gap, c), color: p.gap < 0 ? COLORS.bad : COLORS.good },
                  ...(balanceLine ? [{ label: 'Running balance', value: full(p.balance, c) }] : []),
                ]}
              />
            );
          }}
        />
        <Bar dataKey="incomeActual" stackId="income" name="Income so far" fill={COLORS.income} barSize={16} />
        <Bar dataKey="incomeRest" stackId="income" name="Projected income" fill={COLORS.income} fillOpacity={0.45} barSize={16} radius={[4, 4, 0, 0]}>
          <ErrorBar dataKey="incomeErr" width={6} strokeWidth={1.5} stroke={COLORS.income} direction="y" />
        </Bar>
        <Bar dataKey="expenseActual" stackId="expense" name="Expenses so far" fill={COLORS.expense} barSize={16} />
        <Bar dataKey="expenseRest" stackId="expense" name="Projected expenses" fill={COLORS.expense} fillOpacity={0.45} barSize={16} radius={[4, 4, 0, 0]}>
          <ErrorBar dataKey="expenseErr" width={6} strokeWidth={1.5} stroke={COLORS.expense} direction="y" />
        </Bar>
        <Line dataKey="gapUp" name="Gap" stroke={COLORS.good} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        <Line dataKey="gapDown" name="Shortfall" stroke={COLORS.bad} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
        {balanceLine && <Line dataKey="balance" name="Running balance" stroke="var(--fi-amber)" strokeDasharray="5 3" strokeWidth={2} dot={false} />}
      </ComposedChart>
      <Legend
        items={[
          { label: 'Income (solid = received)', color: COLORS.income },
          { label: 'Expenses (solid = spent)', color: COLORS.expense },
          { label: 'Gap (red = shortfall)', color: COLORS.good, style: 'line' },
          ...(balanceLine ? [{ label: 'Running balance', color: 'var(--fi-amber)', style: 'dashed' as const }] : []),
        ]}
      />
      <div className={styles.toggles}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={balanceLine} onChange={(e) => setBalanceLine(e.target.checked)} />
          Show running balance
        </label>
        {balanceLine && (
          <label className={styles.toggle}>
            <input type="checkbox" checked={v.includeSavings} onChange={(e) => v.setIncludeSavings(e.target.checked)} />
            Include savings
          </label>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.gapTable}>
          <caption className={styles.srOnly}>Projected gap by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Income</th>
              <th scope="col">Expenses</th>
              <th scope="col">Savings</th>
              <th scope="col">Gap</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {f.months.map((m) => (
              <tr key={m.month} data-short={m.gap < 0 || undefined}>
                <th scope="row">
                  {m.label}
                  {m.current && <small> now</small>}
                </th>
                <td>
                  {full(m.income)}
                  {m.incomeEstimated > 0 && <small title="Includes an estimate of irregular income"> est.</small>}
                </td>
                <td>
                  {full(m.expense)}
                  {m.expenseSource === 'plan' && <small> plan</small>}
                </td>
                <td>{full(m.savings)}</td>
                <td className={styles.gapCell}>
                  {m.gap < 0 ? (
                    <>
                      <span>−{full(-m.gap)}</span>
                      <Link href={`/budget?month=${m.month}`}>plan for it</Link>
                    </>
                  ) : (
                    full(m.gap)
                  )}
                </td>
                <td data-negative={m.balance < 0 || undefined}>{full(m.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.whatIf}>
        <p className={styles.listTitle}>What if…</p>
        {v.data.forecastItems.length > 0 && (
          <ul className={styles.whatIfList}>
            {v.data.forecastItems.map((x) => (
              <li key={x.id}>
                <span>
                  {x.name} · {monthName(x.month)} · <strong data-tone={x.kind === 'expense' ? 'bad' : 'good'}>{x.kind === 'expense' ? '−' : '+'}{full(x.amount, c)}</strong>
                </span>
                <Link href={`/budget?month=${x.month}`} className={styles.inlineAction}>
                  Plan it
                </Link>
                <button type="button" onClick={() => v.removeForecastItem(x.id)} aria-label={`Remove ${x.name}`}>
                  <X size={14} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <WhatIfForm
            // Any of the next 12 months — not just those the horizon shows.
            months={Array.from({ length: 13 }, (_, i) => shiftMonthKey(monthKey(new Date()), i))}
            onCancel={() => setAdding(false)}
            onSave={async (item) => {
              await v.addForecastItem(item);
              setAdding(false);
            }}
          />
        ) : (
          <button type="button" className={styles.addButton} onClick={() => setAdding(true)}>
            <Plus size={14} strokeWidth={2.5} aria-hidden /> Add expected item
          </button>
        )}
      </div>

      {(v.advice.tips.length > 0 || v.advice.suggested) && (
        <ul className={styles.guidance}>
          {v.advice.tips.map((t) => (
            <li key={t.text}>
              <p>{t.text}</p>
              <Link href={t.href} className={styles.guidanceAction}>
                {t.action}
              </Link>
            </li>
          ))}
          {v.advice.suggested && (
            <li>
              <p>
                Suggested budget for {monthName(v.advice.suggested.month)}: <strong>{full(v.advice.suggested.amount, c)}</strong>
              </p>
              <Link href={v.advice.suggested.href} className={styles.guidanceAction}>
                Start {monthName(v.advice.suggested.month)} plan
              </Link>
            </li>
          )}
        </ul>
      )}

      <details className={styles.how}>
        <summary>How is this calculated?</summary>
        <p>
          <strong>Income</strong> is what your budget expects (recurring income like a salary, and one-off income you added), plus an estimate for
          irregular income: the average of the last 6 months, with recent months counting more. That part is marked “est.”.
        </p>
        <p>
          <strong>Expenses</strong> use a month’s budget plan when it has one. Otherwise they’re your recent average of fixed, variable and unplanned
          spending, plus yearly costs that came up in the same month last year.
        </p>
        <p>
          The <strong>range</strong> shows how much your income and spending moved around over the last 6 months. The current month adds what already
          happened to a projection for the rest of it. <strong>Gap</strong> = income − expenses − planned savings.
        </p>
      </details>
    </>
  );
}

function WhatIfForm({
  months,
  onSave,
  onCancel,
}: {
  months: string[];
  onSave: (item: { name: string; month: string; kind: 'income' | 'expense'; amount: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const nextMonth = shiftMonthKey(monthKey(new Date()), 1);
  const [name, setName] = useState('');
  const [month, setMonth] = useState(months.includes(nextMonth) ? nextMonth : months[0]);
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const valid = name.trim() && value > 0;
  return (
    <form
      className={styles.whatIfForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await onSave({ name: name.trim(), month, kind, amount: value });
      }}
    >
      <Pills
        label="Kind"
        small
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. School fees" aria-label="What is it?" />
      <div className={styles.whatIfRow}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)} {m.slice(0, 4)}
            </option>
          ))}
        </select>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Amount" aria-label="Amount" />
      </div>
      <div className={styles.whatIfRow}>
        <button type="button" className={styles.textButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.primaryButton} disabled={!valid || busy}>
          {busy ? 'Adding…' : 'Add to forecast'}
        </button>
      </div>
    </form>
  );
}
