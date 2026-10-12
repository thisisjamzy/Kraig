'use client';

// The money plan (Remix/Priorities/priorities-forecasting-brief.md, section
// 5), one responsive page for phone and web: the title and what the locked
// layer means, the controls (horizon, buffer, scenario, reset, changes),
// six KPIs, "How your plan looks" (forecast with fixes, the locked-layer
// waterfall, money in and out, where the money goes, the comparison),
// "Adjust your plan" (List or Board), savings goals, the month's priorities
// and the baskets. Two cards per row on wide screens, one below 900 px.

import { useEffect, useRef, useState } from 'react';
import { GuideProvider, KpiTile, ChartCard } from '@/src/widgets/Charts/ChartCard';
import charts from '@/src/widgets/Charts/Charts.module.css';
import { compact, money, signedCompact } from '@/src/shared/dashboard/format';
import { PLAN_GUIDE } from '@/src/shared/planner/guides';
import { dayLabel, MONTH, shortDay, ymd } from '@/src/viewmodels/planner/days';
import { describeChanges, HORIZONS, isLocked, type MoneyHorizon } from '@/src/viewmodels/planner/money';
import type { MoneyPlanLogic } from '@/src/logic/moneyPlan/useMoneyPlan';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { BalanceForecast, BarRows, ColumnWaterfall, CompareBars, GoalBar, InOutColumns, LockGlyph } from './PlanCharts';
import { MoneyBoardView, MoneyListView } from './MoneyPlanBoard';
import { ScenarioBar } from './ScenarioBar';
import p from './Planner.module.css';

export function MoneyPlanPage({ logic, web = false, initialView = 'list' }: { logic: MoneyPlanLogic; web?: boolean; initialView?: 'list' | 'board' }) {
  const { input, scenario, view, actions, currency, store } = logic;
  const [mode, setMode] = useState<'list' | 'board'>(initialView);
  const [applying, setApplying] = useState(false);
  const { run, start, changes } = view;
  const buffer = scenario.buffer;
  const m = (n: number) => money(n, currency);
  const sim = run.sim;
  const periodWord = run.cols[0].type === 'month' ? 'month' : run.cols[0].type;
  const dMin = sim.min.value - start.sim.min.value;

  if (logic.loading) return <ScreenState loading />;

  const goalName = (id: string) => input.goals.find((g) => g.id === id)?.name ?? id;
  const basketRows = (() => {
    const names = new Map<string, { name: string; lock: boolean }>();
    for (const it of input.items) if (it.kind !== 'income') names.set(it.basketId, { name: it.basketName, lock: it.kind === 'fixed' || Boolean(names.get(it.basketId)?.lock) });
    names.set('savings', { name: 'Savings goals', lock: false });
    return [...names.entries()]
      .map(([id, b]) => {
        const v = run.totals.baskets[id] ?? 0;
        const b0 = start.totals.baskets[id] ?? 0;
        const d = v - b0;
        return {
          label: b.name,
          value: v,
          lock: b.lock,
          color: b.lock ? 'var(--c-primary-dark)' : id === 'savings' ? 'var(--c-primary-mid)' : 'var(--c-accent)',
          mark: changes.total ? b0 : null,
          diff: Math.abs(d) > 1 ? { text: signedCompact(d), tone: d < 0 ? ('good' as const) : ('bad' as const) } : null,
        };
      })
      .filter((r) => r.value > 0 || (r.mark ?? 0) > 0)
      .sort((a, b) => b.value - a.value);
  })();

  return (
    <div className={`${p.root} ${charts.palette}`} data-web={web || undefined}>
      <GuideProvider resetKey="money-plan">
        <header className={p.intro}>
          <h1 className={p.title}>Plan and forecast your money</h1>
          <p className={p.lede}>
            Your income and fixed costs are the <b>locked layer</b>: they arrive and leave on set dates and cannot be moved. You plan your variable spending and savings on top of them, and every chart below shows what your changes do. Nothing here changes your real records.
          </p>
        </header>

        <div className={p.controls}>
          <div className={p.seg} role="group" aria-label="Horizon">
            {HORIZONS.map((h) => (
              <button key={h.value} type="button" aria-pressed={scenario.horizon === h.value} onClick={() => actions.setHorizon(h.value as MoneyHorizon)}>
                {h.label}
              </button>
            ))}
          </div>
          <BufferField value={buffer} onChange={actions.setBuffer} currency={currency} />
          <label className={p.check}>
            <input type="checkbox" checked={scenario.confirmedOnly} onChange={(e) => actions.setConfirmedOnly(e.target.checked)} />
            Plan with confirmed income only
          </label>
          <ScenarioBar store={store} />
          <button type="button" className={p.button} onClick={actions.reset} disabled={!changes.total}>
            Reset to starting plan
          </button>
          {changes.total > 0 && (
            <span className={charts.pill} data-tone="neutral">
              {changes.total} change{changes.total > 1 ? 's' : ''} from the starting plan
            </span>
          )}
          {logic.recordChanges.length > 0 && (
            <button type="button" className={p.button} data-primary onClick={() => setApplying(true)}>
              Apply to my records
            </button>
          )}
        </div>

        <div className={p.kpis}>
          <KpiTile kpi={{ label: 'Balance today', value: m(input.balance), pill: null, sub: 'Across your spending wallets' }} />
          <KpiTile kpi={{ label: 'Coming in', icon: <LockGlyph />, value: m(run.totals.income), pill: null, sub: `Locked income to ${shortDay(run.end)}` }} />
          <KpiTile kpi={{ label: 'Fixed costs', icon: <LockGlyph />, value: m(run.totals.fixed), pill: null, sub: run.totals.fromGoals ? `${compact(run.totals.fromGoals)} of it paid from savings` : 'Locked, always paid' }} />
          <KpiTile kpi={{ label: 'Variable costs', value: m(run.totals.variable), pill: null, sub: 'Yours to plan' }} />
          <KpiTile kpi={{ label: 'To savings', value: m(run.totals.savings), pill: null, sub: 'Transfers to your goals' }} />
          <KpiTile
            kpi={{
              label: 'Lowest balance',
              value: m(sim.min.value),
              pill: Math.abs(dMin) > 1 ? { text: `${signedCompact(dMin)} vs start`, tone: dMin > 0 ? 'good' : 'bad' } : sim.min.value < buffer ? { text: 'Below your buffer', tone: 'bad' } : null,
              sub: `On ${dayLabel(sim.min.day)}`,
            }}
          />
        </div>

        <h2 className={p.section}>How your plan looks</h2>
        <div className={p.grid}>
          <ChartCard
            className={p.span12}
            title="Balance forecast"
            subtitle={`Your expected balance every day from today to ${dayLabel(run.end)}${changes.total ? ', with the starting plan for comparison' : ''}`}
            chartType="line"
            guide={PLAN_GUIDE.forecast}
            legend={[
              { label: 'Your plan', color: 'var(--c-primary)' },
              ...(changes.total ? [{ label: 'Starting plan', line: true }] : []),
              { label: `Safety buffer ${compact(buffer)}`, line: true },
              { label: 'Lowest point', color: 'var(--c-bad)' },
            ]}
          >
            <BalanceForecast
              from={input.today}
              to={run.end}
              points={sim.points}
              startPoints={changes.total ? start.sim.points : null}
              buffer={buffer}
              dividers={run.cols.slice(1).map((c) => c.start)}
              labels={run.cols.map((c) => ({ day: Math.round((c.start + c.end) / 2), text: c.type === 'month' ? MONTH[ymd(c.end).m - 1] : c.type === 'week' ? shortDay(c.end - 6) : c.label }))}
              lowest={{ day: sim.min.day, value: sim.min.value, text: `${compact(sim.min.value)}, ${shortDay(sim.min.day)}` }}
              ariaLabel={`Balance forecast from ${m(input.balance)} today to ${m(sim.end)} on ${dayLabel(run.end)}, lowest ${m(sim.min.value)} on ${dayLabel(sim.min.day)}`}
            />
            {view.dip ? (
              <div className={p.warn}>
                <p>
                  <b>
                    Your balance first falls below the {compact(buffer)} buffer on {dayLabel(view.dip[0])}
                  </b>{' '}
                  and reaches {m(sim.min.value)} on {dayLabel(sim.min.day)}.{view.fixes.length ? ' Some options:' : ''}
                </p>
                {view.fixes.map((f, i) => (
                  <div key={i} className={p.fix}>
                    <span>
                      {f.action === 'goal' ? (
                        <>
                          Save {compact(f.amount)} less a month towards <b>{f.name}</b> ({compact(f.monthly ?? 0)} instead of {compact((f.monthly ?? 0) + f.amount)})
                        </>
                      ) : f.action === 'move' ? (
                        <>
                          Move <b>{f.name}</b> ({compact(f.amount)}, {f.from != null ? shortDay(f.from) : ''}) to {f.toLabel}
                        </>
                      ) : (
                        <>
                          Skip <b>{f.name}</b> ({compact(f.amount)}, {f.from != null ? shortDay(f.from) : ''})
                        </>
                      )}
                      . Lowest balance becomes <b>{m(f.lowest)}</b>.
                    </span>
                    <button type="button" className={p.small} data-primary onClick={() => actions.applyFix(f)}>
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={charts.insight}>
                Your balance stays above the {compact(buffer)} buffer for the whole period and ends at {m(sim.end)}.
              </p>
            )}
          </ChartCard>

          <ChartCard
            className={p.span6}
            title="From the locked layer to your plan"
            subtitle="What is left once income and fixed costs are counted, and where it goes"
            chartType="waterfall"
            guide={PLAN_GUIDE.lockedWaterfall}
            insight={`After the locked layer you have ${m(run.waterfall.leftToPlan)} to plan with until ${shortDay(run.end)}. Your variable costs and savings use ${m(run.totals.variable + run.totals.savings)} of it${run.totals.fromGoals ? `, and ${m(run.totals.fromGoals)} of fixed costs is paid from savings` : ''}.${sim.min.value < buffer && sim.end >= buffer ? ` You still end above your buffer, but timing matters: before income arrives, your balance falls to ${m(sim.min.value)} on ${dayLabel(sim.min.day)}.` : ''}`}
          >
            <ColumnWaterfall
              format={compact}
              ariaLabel={`Waterfall: ${m(run.waterfall.leftToPlan)} left to plan after the locked layer, ending at ${m(sim.end)}`}
              steps={[
                { label: 'Today', kind: 'total', value: input.balance, color: 'var(--c-grey)' },
                { label: 'Income', kind: 'delta', value: run.totals.income, color: 'var(--c-primary)', lock: true },
                { label: 'Fixed', kind: 'delta', value: -run.waterfall.fixedFromWallet, color: 'var(--c-primary-dark)', lock: true },
                { label: 'Left to plan', kind: 'sub', color: 'var(--c-primary-light)' },
                { label: 'Variable', kind: 'delta', value: -run.totals.variable, color: 'var(--c-accent)' },
                { label: 'Savings', kind: 'delta', value: -run.totals.savings, color: 'var(--c-primary-mid)' },
                { label: 'End', kind: 'total', color: sim.end < buffer ? 'var(--c-bad)' : 'var(--c-grey)' },
              ]}
            />
          </ChartCard>

          <ChartCard
            className={p.span6}
            title={`Money in and out by ${periodWord}`}
            subtitle="Income against what leaves your wallets in each period"
            chartType="paired"
            guide={PLAN_GUIDE.inOut}
            legend={[
              { label: 'In', color: 'var(--c-primary)' },
              { label: 'Fixed', color: 'var(--c-primary-dark)' },
              { label: 'Variable', color: 'var(--c-accent)' },
              { label: 'Savings', color: 'var(--c-primary-mid)' },
            ]}
          >
            <InOutColumns
              ariaLabel="Money in and out by period"
              periods={run.cols.map((c) => {
                const x = run.periods[c.key];
                return {
                  label: c.type === 'month' ? MONTH[ymd(c.end).m - 1] : c.type === 'week' ? shortDay(c.end - 6) : c.label,
                  in: x.in,
                  fixed: Math.max(0, x.fixed - x.fromGoals),
                  variable: x.variable,
                  savings: x.savings,
                  end: x.end,
                  low: x.end < buffer,
                };
              })}
            />
          </ChartCard>

          <ChartCard
            className={p.span6}
            title="Where the money goes"
            subtitle={`Each basket's total until ${shortDay(run.end)}`}
            chartType="bars"
            guide={PLAN_GUIDE.baskets}
            legend={[
              { label: 'Locked', color: 'var(--c-primary-dark)' },
              { label: 'Flexible', color: 'var(--c-accent)' },
              { label: 'Savings', color: 'var(--c-primary-mid)' },
              ...(changes.total ? [{ label: 'Starting plan (mark)', color: 'var(--c-text)' }] : []),
            ]}
            state={basketRows.length ? undefined : { status: 'empty', text: 'Nothing goes out in this period.' }}
          >
            <BarRows rows={basketRows} format={compact} ariaLabel="Where the money goes, by basket" />
          </ChartCard>

          <ChartCard className={p.span6} title="Starting plan against your plan" subtitle={describeChanges(changes)} chartType="bars" guide={PLAN_GUIDE.compare} legend={[{ label: 'Starting plan', color: 'var(--c-primary-mid)' }, { label: 'Your plan', color: 'var(--c-primary)' }]}>
            <CompareBars
              rows={[
                { label: 'Lowest balance', start: start.sim.min.value, plan: sim.min.value, higherIsBetter: true },
                { label: `Balance on ${shortDay(run.end)}`, start: start.sim.end, plan: sim.end, higherIsBetter: true },
                { label: 'Variable spending', start: start.totals.variable, plan: run.totals.variable, higherIsBetter: false },
                { label: 'Saved into goals', start: start.totals.savings, plan: run.totals.savings, higherIsBetter: true },
              ]}
            />
          </ChartCard>
        </div>

        <h2 className={p.section}>Adjust your plan</h2>
        <ChartCard
          title={`Your plan by ${periodWord}`}
          subtitle="Locked items are shown for context. Change the date of a variable cost or savings transfer, skip it, or put it off."
          chartType="transactions"
          guide={PLAN_GUIDE.plan}
          tools={
            <div className={p.seg} role="group" aria-label="View">
              <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
                List
              </button>
              <button type="button" aria-pressed={mode === 'board'} onClick={() => setMode('board')}>
                Board
              </button>
            </div>
          }
        >
          {mode === 'list' ? <MoneyListView input={input} view={view} buffer={buffer} actions={actions} /> : <MoneyBoardView input={input} view={view} buffer={buffer} actions={actions} />}
        </ChartCard>

        <div className={p.grid}>
          <ChartCard className={p.span7} title="Savings goals" subtitle="How much each goal will hold by its deadline at the monthly amount you set" chartType="bullet" guide={PLAN_GUIDE.goals} state={view.goals.length ? undefined : { status: 'empty', text: 'No savings baskets yet. Add one to plan towards a goal.', href: '/baskets', linkText: 'Open baskets' }}>
            <div className={p.goals}>
              {view.goals.map((g) => (
                <div key={g.goal.id} className={p.goal}>
                  <div className={p.goalTop}>
                    <b>{g.goal.name}</b>
                    {g.goal.target ? (
                      <span className={charts.pill} data-tone={g.onTrack ? 'good' : 'bad'}>
                        {g.onTrack ? 'On track' : `Short by ${compact((g.goal.target ?? 0) - g.atDeadline)}`}
                      </span>
                    ) : null}
                  </div>
                  <GoalBar now={g.goal.current} by={g.atDeadline} target={g.goal.target} ariaLabel={`${g.goal.name}: ${m(g.goal.current)} now, ${m(g.atDeadline)} by ${shortDay(g.by)}${g.goal.target ? `, target ${m(g.goal.target)}` : ''}`} />
                  <span className={p.muted}>
                    {m(g.goal.current)} now. <b>{m(g.atDeadline)}</b> by {dayLabel(g.by)}
                    {g.goal.target ? ` (target ${m(g.goal.target)}).` : '.'} {!g.onTrack && g.needed ? `Save at least ${m(g.needed)} a month to get there.` : ''}
                  </span>
                  <GoalSlider value={g.monthly} label={`Save per month for ${g.goal.name}`} currency={currency} onChange={(v) => actions.setGoalMonthly(g.goal.id, v)} />
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard className={p.span5} title={`Priorities for ${view.priorities.month}`} subtitle={`What this plan commits you to by ${shortDay(view.priorities.monthEnd)}`} chartType="bullet" guide={PLAN_GUIDE.priorities} insight={`These targets update as you change the plan. ${store.isActive ? 'This is your active plan.' : 'Make this plan active to use them as the month’s checklist.'}`}>
            <ul className={p.targets}>
              <li>
                <LockGlyph /> Receive <b>{m(view.priorities.receive)}</b> in income
              </li>
              <li>
                <LockGlyph /> Pay <b>{m(view.priorities.pay)}</b> in fixed costs
              </li>
              <li>
                Save <b>{m(view.priorities.save)}</b> into your goals
              </li>
              <li>
                Keep variable spending under <b>{m(view.priorities.variable)}</b>
              </li>
              <li data-bad={view.priorities.endWith < buffer || undefined}>
                End the month with <b>{m(view.priorities.endWith)}</b> {view.priorities.endWith < buffer ? 'below your buffer' : 'in your wallets'}
              </li>
            </ul>
          </ChartCard>
        </div>

        <ChartCard title="Baskets" subtitle="Fixed baskets are locked and always paid. Variable baskets can change or be forgone: untick an item to see the plan without it." chartType="transactions" guide={PLAN_GUIDE.plan}>
          <Baskets logic={logic} goalName={goalName} />
        </ChartCard>

        {applying && <ApplyDialog logic={logic} onClose={() => setApplying(false)} />}
      </GuideProvider>
    </div>
  );
}

function Baskets({ logic, goalName }: { logic: MoneyPlanLogic; goalName: (id: string) => string }) {
  const { input, scenario, actions, view } = logic;
  const groups = new Map<string, { name: string; items: typeof input.items }>();
  for (const it of input.items) {
    const g = groups.get(it.basketId) ?? { name: it.basketName, items: [] };
    g.items.push(it);
    groups.set(it.basketId, g);
  }
  const total = (id: string) => view.run.occ.filter((o) => o.item.id === id && !o.skip && o.date != null && o.date <= view.run.end).reduce((a, o) => a + o.amount, 0);
  return (
    <div className={p.baskets}>
      {[...groups.entries()].map(([id, g]) => {
        const locked = g.items.every((i) => isLocked(i));
        const sum = g.items.reduce((a, i) => a + total(i.id), 0);
        return (
          <details key={id} className={p.basket} open>
            <summary>
              <span>
                {locked && <LockGlyph />}
                {g.name}
              </span>
              <b>{compact(sum)}</b>
            </summary>
            {g.items.map((i) => {
              const li = isLocked(i);
              const on = !scenario.disabled.includes(i.id);
              return (
                <label key={i.id} className={p.basketRow}>
                  <input type="checkbox" checked={li || on} disabled={li} title={li ? 'Locked: always included' : undefined} onChange={() => actions.toggleItem(i.id)} />
                  <span>
                    {i.name}{' '}
                    <span className={p.muted}>
                      {repeatText(i)}
                      {i.confidence === 'Expected' ? ', expected' : ''}
                      {i.fundedByGoalId ? `, paid from ${goalName(i.fundedByGoalId)}` : ''}
                    </span>
                  </span>
                  <b>{compact(total(i.id) || i.amount)}</b>
                </label>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "monthly, day 25", "every Fri", "daily", "once, 31 Oct", "not scheduled". */
function repeatText(i: MoneyPlanLogic['input']['items'][number]): string {
  if (i.freq === 'monthly') return `monthly, day ${i.dayOfMonth ?? 1}`;
  if (i.freq === 'weekly') return `every ${WEEKDAYS[i.weekday ?? 0]}`;
  if (i.freq === 'dates') return i.repeat === 'once' ? (i.schedule?.[0] ? `once, ${shortDay(i.schedule[0].day)}` : 'once') : (i.repeat ?? 'repeating');
  return i.date == null ? 'not scheduled' : `once, ${shortDay(i.date)}`;
}

function BufferField({ value, onChange, currency }: { value: number; onChange: (n: number) => void; currency: string }) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(String(value));
  }
  return (
    <label className={p.field}>
      Safety buffer ({currency})
      <input
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => onChange(Number(text) || 0)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(Number(text) || 0);
        }}
      />
    </label>
  );
}

/** Moves the label at once; the plan follows about 120 ms after the slider stops. */
function GoalSlider({ value, label, currency, onChange }: { value: number; label: string; currency: string; onChange: (n: number) => void }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (prev !== value) {
    setPrev(value);
    setShown(value);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const max = Math.max(150_000, Math.ceil((value * 1.5) / 5000) * 5000);
  return (
    <label className={p.range}>
      <span>Save per month</span>
      <input
        type="range"
        min={0}
        max={max}
        step={5000}
        value={shown}
        aria-label={label}
        onChange={(e) => {
          const v = Number(e.target.value);
          setShown(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), 120);
        }}
      />
      <b>{money(shown, currency)}</b>
    </label>
  );
}

function ApplyDialog({ logic, onClose }: { logic: MoneyPlanLogic; onClose: () => void }) {
  const possible = logic.recordChanges.filter((c) => c.run);
  const [chosen, setChosen] = useState<string[]>(possible.map((c) => c.key));
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Apply to my records" onClose={onClose}>
      <div className={p.dialog}>
        <p className={p.muted}>These changes will be made to your baskets. Income and fixed costs are never changed from here.</p>
        <ul className={p.changeList}>
          {logic.recordChanges.map((c) => (
            <li key={c.key}>
              {c.run ? (
                <label>
                  <input type="checkbox" checked={chosen.includes(c.key)} onChange={(e) => setChosen((x) => (e.target.checked ? [...x, c.key] : x.filter((k) => k !== c.key)))} />
                  {c.text}
                </label>
              ) : (
                <span>
                  {c.text}
                  <em>{c.blocked}</em>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className={p.dialogActions}>
          <button type="button" className={p.button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={p.button}
            data-primary
            disabled={!chosen.length || busy}
            onClick={async () => {
              setBusy(true);
              await logic.applyToRecords(chosen);
              setBusy(false);
              onClose();
            }}
          >
            {busy ? 'Applying…' : `Apply ${chosen.length} change${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
