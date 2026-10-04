'use client';

// Plans forecast — "Where are my plans heading?". Can I afford what's
// planned, which plans are on schedule, what's due month by month, what to
// set aside each month, and what if I move things around. Horizon and
// scenario apply to every card.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { useLogic, type PlansForecastLogic } from '@/src/phone/logic/plansForecast/useLogic';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { monthKey, monthLabel, remaining, shiftMonth } from '@/src/viewmodels/plans/model';
import type { Scenario } from '@/src/viewmodels/plans/forecast';
import { AXIS_TICK, COLORS, Card, Chip, Figure, Legend, STATUS_TEXT, STATUS_TONE, Segmented, TooltipBox, Visual, compact, full, monthShort } from '@/src/phone/screens/Plans/parts';
import styles from '@/src/phone/screens/Plans/Plans.module.css';
import { Fragment, type ReactNode } from 'react';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { GridCard, PageGrid, type CardSize } from '@/src/phone/widgets/Layout/PageGrid';

export function PlansForecastScreen() {
  const v = useLogic();
  const [howOpen, setHowOpen] = useState(false);
  // Medium screens and up: the cards on the dashboard grid (affordability
  // XL beside the schedule, month by month and set-aside side by side,
  // what-if full width). Plain fragments on a phone.
  const inShell = useHasTopBar();
  const Grid = inShell ? PageGrid : Fragment;

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <Link href="/baskets" className={styles.roundButton} aria-label="Back to Baskets">
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
        }
        title="Plans forecast"
        right={
          <button type="button" className={styles.roundButton} aria-label="How is this calculated?" aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)}>
            <Info size={18} strokeWidth={2} />
          </button>
        }
      />
      <div className={styles.controls}>
        <Segmented
          label="Horizon"
          value={String(v.horizon)}
          onChange={(x) => v.setHorizon(Number(x))}
          options={[3, 6, 12].map((n) => ({ value: String(n), label: `${n}m` }))}
        />
        <Segmented<Scenario>
          label="Scenario"
          value={v.scenario}
          onChange={v.setScenario}
          options={[
            { value: 'cautious', label: 'Cautious' },
            { value: 'expected', label: 'Expected' },
            { value: 'optimistic', label: 'Optimistic' },
          ]}
        />
        {v.forecast.lowConfidence && (
          <Chip tone="watch">Low confidence</Chip>
        )}
      </div>
      {howOpen && (
        <div className={styles.infoBox}>
          {v.forecast.lowConfidence && (
            <p>
              <strong>Low confidence:</strong> under 3 months of history so far.
            </p>
          )}
        <p>
          <strong>Income</strong> each month is what your budget expects (salary and other income items, plus one-offs), plus an estimate for irregular
          income: your last 6 months, recent ones counting more.
        </p>
        <p>
          <strong>Committed</strong> is fixed items and savings still to pay that month. <strong>Usual variable spending</strong> is the month&apos;s variable
          plan if set, otherwise your last 6 months of variable and unplanned spending.
        </p>
        <p>
          <strong>Free money</strong> = income − committed − variable. <strong>Plan payments</strong> are what your plans still owe that month. The balance
          starts from what&apos;s available now and carries forward. Cautious uses your lower recent income and higher spending; Optimistic the reverse.
        </p>
        </div>
      )}

      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          {v.whatIfActive && (
            <div className={styles.whatIfBanner} role="status">
              <span>What-if on</span>
              <div>
                <button type="button" className={styles.ghost} onClick={v.reset}>
                  Reset
                </button>
                <button type="button" className={styles.primary} disabled={v.applying} onClick={v.apply}>
                  {v.applying ? 'Applying…' : 'Apply changes'}
                </button>
              </div>
            </div>
          )}
          {v.error && <p className={styles.error}>{v.error}</p>}
          <Grid>
          <Cell on={inShell} size="XL">
            <AffordCard v={v} />
          </Cell>
          <Cell on={inShell} size="M">
            <ScheduleCard v={v} />
          </Cell>
          <Cell on={inShell} size="L">
            <MonthlyCard v={v} />
          </Cell>
          <Cell on={inShell} size="L">
            <SetAsideCard v={v} />
          </Cell>
          <Cell on={inShell} size="Full">
            <WhatIfCard v={v} />
          </Cell>
          {v.tips.length > 0 && (
            <Cell on={inShell} size="L">
            <Card title="What could help?">
              <ul className={styles.tips}>
                {v.tips.map((t) => (
                  <li key={t.text}>
                    <p>{t.text}</p>
                    <Link href={t.href} className={styles.tipAction}>
                      {t.action}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            </Cell>
          )}
          </Grid>
        </>
      )}
    </div>
  );
}

/** A dashboard cell on wide screens; nothing extra on a phone. */
function Cell({ on, size, children }: { on: boolean; size: CardSize; children: ReactNode }) {
  return on ? <GridCard size={size}>{children}</GridCard> : <>{children}</>;
}

const name = (m: string) => monthLabel(m, true).split(' ')[0];

function AffordCard({ v }: { v: PlansForecastLogic }) {
  const f = v.forecast;
  const c = v.currency;
  const need = f.months.reduce((s, m) => s + m.planPayments, 0);
  const free = f.months.reduce((s, m) => s + Math.max(0, m.free), 0) + Math.max(0, f.startBalance);
  const lowest = f.months.reduce((low, m) => (m.balance < low.balance ? m : low), f.months[0]);
  const short = Math.max(0, -(lowest?.balance ?? 0));
  const rows = f.months.map((m) => ({ ...m, label: monthShort(m.month, v.today) }));
  const negatives = rows.filter((r) => r.balance < 0);
  return (
    <>
      <Card title="Can I afford my plans?" chip={<Chip tone={STATUS_TONE[v.affordStatus]}>{STATUS_TEXT[v.affordStatus]}</Chip>}>
        <div className={styles.figureGrid} data-cols="3">
          <Figure label="Plans need" value={need} />
          <Figure label="Free" value={free} />
          <Figure label={short > 0 ? 'Short' : 'Lowest balance'} value={short > 0 ? short : lowest?.balance ?? 0} tone={short > 0 ? 'bad' : undefined} />
        </div>
        <Visual>
          <BarChart responsive style={{ width: '100%', height: 190 }} data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -6 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--pl-divider)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            <ReferenceLine y={0} stroke="var(--pl-light)" />
            <Tooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                return p ? (
                  <TooltipBox
                    active={active}
                    title={monthLabel(p.month, true)}
                    rows={[
                      { label: 'Free money', value: full(p.free, c), color: COLORS.blue },
                      { label: 'Plan payments', value: full(p.planPayments, c), color: COLORS.navy },
                      ...(p.incomeEstimated > 0 ? [{ label: 'Income (estimated part)', value: full(p.incomeEstimated, c) }] : []),
                    ]}
                  />
                ) : null;
              }}
            />
            <Bar dataKey="free" name="Free money" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
            <Bar dataKey="planPayments" name="Plan payments" fill={COLORS.navy} radius={[4, 4, 0, 0]} />
          </BarChart>
          <Legend items={[{ label: 'Free money', color: COLORS.blue }, { label: 'Plan payments', color: COLORS.navy }]} />
        </Visual>
        <Visual>
          <LineChart responsive style={{ width: '100%', height: 150 }} data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -6 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--pl-divider)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
            {negatives.map((r) => (
              <ReferenceArea key={r.month} x1={r.label} x2={r.label} fill="var(--pl-red)" fillOpacity={0.1} />
            ))}
            <ReferenceLine y={0} stroke="var(--pl-red)" strokeDasharray="4 3" />
            <Tooltip content={({ active, payload }) => (payload?.[0] ? <TooltipBox active={active} title={String(payload[0].payload.label)} rows={[{ label: 'Balance after', value: full(Number(payload[0].value), c) }]} /> : null)} />
            <Line dataKey="balance" name="Balance" stroke={COLORS.navy} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
          <Legend items={[{ label: 'Balance', color: COLORS.navy, style: 'line' }]} />
        </Visual>
      </Card>
      <section className={styles.band} aria-label="Month by month">
        <h2 className={styles.bandTitle}>Month by month</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.srOnly}>Month</span>
              </th>
              <th scope="col">Free</th>
              <th scope="col">Plans</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {f.months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{monthShort(m.month, v.today)}</th>
                <td data-negative={m.free < 0 || undefined}>{full(m.free)}</td>
                <td>{full(m.planPayments)}</td>
                <td data-negative={m.balance < 0 || undefined}>{full(m.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function ScheduleCard({ v }: { v: PlansForecastLogic }) {
  const rows = v.schedule.filter((r) => r.remaining > 0);
  const onTime = rows.filter((r) => r.monthsLate === 0).length;
  const late = rows.filter((r) => r.monthsLate > 0).map((r) => r.name);
  return (
    <Card
      title="Plans on schedule"
      chip={rows.length ? <Chip tone={STATUS_TONE[v.scheduleStatus]}>{STATUS_TEXT[v.scheduleStatus]}</Chip> : undefined}
      summary={late.length ? `Running late: ${late.join(', ')}.` : undefined}
    >
      {rows.length === 0 ? (
        <p className={styles.muted}>No plans with money left to pay.</p>
      ) : (
        <>
          <div className={styles.figureGrid} data-cols="3">
            <Figure label="On time" value={onTime} />
            <Figure label="Late" value={rows.length - onTime} tone={rows.length > onTime ? 'bad' : undefined} />
            <Figure label="Left to pay" value={rows.reduce((s, r) => s + r.remaining, 0)} />
          </div>
          <ul className={styles.hbars}>
            {rows.map((r) => {
              const total = r.paid + r.remaining || 1;
              return (
                <li key={r.bucketId}>
                  <span className={styles.hbarTop}>
                    <Link href={`/budget/basket/${r.bucketId}`} className={styles.hbarName}>
                      {r.name}
                    </Link>
                    <strong>{full(r.remaining)}</strong>
                  </span>
                  <span className={styles.hbarTrack} role="img" aria-label={`${full(r.paid)} paid, ${full(r.remaining)} remaining`}>
                    <span style={{ width: `${(r.paid / total) * 100}%` }} />
                  </span>
                  <span className={styles.hbarSub} data-tone={r.monthsLate > 0 ? 'bad' : undefined}>
                    {r.forecastEnd ? `Done ${monthShort(r.forecastEnd, v.today)}` : 'Beyond forecast'}
                    {r.targetEnd ? ` · target ${monthShort(r.targetEnd, v.today)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function MonthlyCard({ v }: { v: PlansForecastLogic }) {
  const rows = v.forecast.months.map((m) => ({ label: monthShort(m.month, v.today), month: m.month, must: m.mustPlan, nice: m.nicePlan, total: m.mustPlan + m.nicePlan }));
  const top = v.upcoming.slice(0, 3);
  return (
    <Card title="Due each month">
      <Visual>
        <BarChart responsive style={{ width: '100%', height: 190 }} data={rows} margin={{ top: 18, right: 4, bottom: 0, left: -6 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--pl-divider)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              return p ? (
                <TooltipBox
                  active={active}
                  title={monthLabel(p.month, true)}
                  rows={[
                    { label: 'Must have', value: full(p.must, v.currency), color: COLORS.navy },
                    { label: 'Nice to have', value: full(p.nice, v.currency), color: COLORS.light },
                  ]}
                />
              ) : null;
            }}
          />
          <Bar dataKey="must" stackId="s" name="Must have" fill={COLORS.navy} />
          <Bar dataKey="nice" stackId="s" name="Nice to have" fill={COLORS.light} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="total" position="top" formatter={(x: unknown) => (Number(x) > 0 ? compact(Number(x)) : '')} fontSize={10} fill="var(--pl-navy)" />
          </Bar>
        </BarChart>
        <Legend items={[{ label: 'Must have', color: COLORS.navy }, { label: 'Nice to have', color: COLORS.light }]} />
      </Visual>
      {top.length > 0 && (
        <Visual>
          <ul className={styles.incomeList}>
            {top.map((o) => (
              <li key={o.key}>
                <span>
                  <strong>{o.name}</strong>
                  <span className={styles.muted}>
                    {o.due ? o.due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date'}
                  </span>
                </span>
                <strong>{full(remaining(o))}</strong>
              </li>
            ))}
          </ul>
        </Visual>
      )}
    </Card>
  );
}

function SetAsideCard({ v }: { v: PlansForecastLogic }) {
  const rows = v.schedule.filter((r) => r.remaining > 0);
  const total = rows.reduce((s, r) => s + r.setAside, 0);
  return (
    <Card title="Set aside monthly" chip={rows.length ? <span className={styles.headFigure}>{full(total, v.currency)} / mo</span> : undefined}>
      {rows.length === 0 ? (
        <p className={styles.muted}>Nothing to set aside.</p>
      ) : (
        <>
          <Visual>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className={styles.srOnly}>Plan</span>
                  </th>
                  <th scope="col">Left</th>
                  <th scope="col">Months</th>
                  <th scope="col">Per month</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.bucketId}>
                    <th scope="row">{r.name}</th>
                    <td>{full(r.remaining)}</td>
                    <td>{r.monthsLeft}</td>
                    <td>{full(r.setAside)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>{full(rows.reduce((s, r) => s + r.remaining, 0))}</td>
                  <td />
                  <td>{full(total)}</td>
                </tr>
              </tfoot>
            </table>
          </Visual>
          <button type="button" className={styles.primary} disabled={v.savingPlan || v.savedPlan} onClick={v.createSavingsPlan}>
            {v.savedPlan ? 'Savings plan created' : v.savingPlan ? 'Creating…' : 'Create savings plan'}
          </button>
        </>
      )}
    </Card>
  );
}

function WhatIfCard({ v }: { v: PlansForecastLogic }) {
  const [pick, setPick] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date(v.today.getFullYear(), v.today.getMonth() + 3, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [extraKind, setExtraKind] = useState<'income' | 'expense'>('expense');
  const [extraName, setExtraName] = useState('');
  const [extraMonth, setExtraMonth] = useState(shiftMonth(monthKey(v.today), 1));
  const [extraAmount, setExtraAmount] = useState('');
  const item = v.changeable.find((o) => o.key === pick);

  // Compare with the plan as it stands.
  const shortNow = v.baseline.months.find((m) => m.balance < 0);
  const shortThen = v.forecast.months.find((m) => m.balance < 0);
  const changed = [...Object.keys(v.whatIf.moves), ...v.whatIf.drops].map(v.nameOf);
  let summary: string | undefined;
  if (v.whatIfActive) {
    const who = changed.length ? `${changed.slice(0, 2).join(' and ')}${changed.length > 2 ? ` and ${changed.length - 2} more` : ''}` : 'These changes';
    if (shortNow && !shortThen) summary = `${who} removes ${name(shortNow.month)}'s shortfall.`;
    else if (!shortNow && shortThen) summary = `${who} creates a shortfall in ${name(shortThen.month)}.`;
    else {
      const end = (f: typeof v.forecast) => f.months[f.months.length - 1]?.balance ?? 0;
      const delta = end(v.forecast) - end(v.baseline);
      summary = `${who} ${delta >= 0 ? 'leaves' : 'costs'} ${full(Math.abs(delta), v.currency)} ${delta >= 0 ? 'more' : ''} by the end of the horizon.`.replace('  ', ' ');
    }
  }
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(monthKey(v.today), i));

  return (
    <Card id="whatif" title="What if…" summary={summary}>
      <div className={styles.form}>
        <label className={styles.field}>
          Item
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Move or drop an item</option>
            {v.changeable.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name} · {full(remaining(o))} · {o.due ? o.due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'no date'}
              </option>
            ))}
          </select>
        </label>
        {item && (
          <>
            <label className={styles.field}>
              Move to
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.ghost} onClick={() => v.dropItem(item)}>
                Drop it
              </button>
              <button type="button" className={styles.primary} disabled={!date} onClick={() => v.postponeItem(item, new Date(`${date}T12:00`))}>
                Move
              </button>
            </div>
          </>
        )}
        <Segmented
          label="Add an expected"
          value={extraKind}
          onChange={setExtraKind}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <label className={styles.field}>
          What
          <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="e.g. School fees" />
        </label>
        <div className={styles.figures}>
          <label className={styles.field}>
            Month
            <select value={extraMonth} onChange={(e) => setExtraMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m, true)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field} style={{ gridColumn: 'span 2' }}>
            Amount
            <input inputMode="decimal" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <button
          type="button"
          className={styles.ghost}
          disabled={!extraName.trim() || !(Number(extraAmount) > 0)}
          onClick={() => {
            v.addExtra({ name: extraName.trim(), month: extraMonth, kind: extraKind, amount: Number(extraAmount) });
            setExtraName('');
            setExtraAmount('');
          }}
        >
          + Add to what-if
        </button>
      </div>
      {v.whatIfActive && (
        <ul className={styles.whatIfList}>
          {Object.entries(v.whatIf.moves).map(([key, d]) => (
            <li key={key}>
              <span>
                Move {v.nameOf(key)} to {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <button type="button" className={styles.ghost} onClick={() => v.removeChange('move', key)} aria-label="Remove">
                <X size={14} />
              </button>
            </li>
          ))}
          {v.whatIf.drops.map((key) => (
            <li key={key}>
              <span>Drop {v.nameOf(key)}</span>
              <button type="button" className={styles.ghost} onClick={() => v.removeChange('drop', key)} aria-label="Remove">
                <X size={14} />
              </button>
            </li>
          ))}
          {v.whatIf.extras.map((x) => (
            <li key={x.id}>
              <span>
                {x.kind === 'income' ? '+' : '−'}
                {full(x.amount)} {x.name} · {monthShort(x.month, v.today)} (preview only)
              </span>
              <button type="button" className={styles.ghost} onClick={() => v.removeChange('extra', x.id)} aria-label="Remove">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
