// The money plan's engine (Remix/Priorities/priorities-forecasting-brief.md,
// sections 3, 4 and 7). Income and fixed costs are the LOCKED layer: they
// keep their dates and can never be moved, skipped or forgone, and every
// change function here refuses them. Variable costs and savings transfers
// are flexible. A scenario stores only what the user changed (overrides,
// forgone items, goal amounts); the starting plan is the same horizon with
// none of them. Everything is a simulation: nothing here touches records.
// Pure; tested in test/planner.test.ts.

import { dayFrom, daysInMonth, MONTH_LONG, monthKeyOf, shortDay, weekdayOf, ymd, type Day } from './days';

export type PlanKind = 'income' | 'fixed' | 'variable' | 'savings';
export type PlanPriority = 'Must' | 'Should' | 'Could';
export type MoneyHorizon = '1w' | '4w' | '3m' | '6m';
export type Confidence = 'Confirmed' | 'Expected';

export const HORIZONS: { value: MoneyHorizon; label: string }[] = [
  { value: '1w', label: '1 week' },
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
];

export interface PlanItem {
  id: string;
  name: string;
  basketId: string;
  basketName: string;
  kind: PlanKind;
  amount: number;
  /** dates: an explicit schedule (`schedule`), as read from the records. */
  freq: 'once' | 'weekly' | 'monthly' | 'dates';
  /** once: its date (null: not scheduled, a wish). */
  date?: Day | null;
  /** weekly: Monday 0 to Sunday 6. */
  weekday?: number;
  /** monthly: the day, clamped to the month's length. */
  dayOfMonth?: number;
  until?: Day | null;
  /** freq "dates": each date and what is due then. */
  schedule?: { day: Day; amount: number }[];
  /** How it repeats in the records, for grouping and labels. */
  repeat?: 'once' | 'daily' | 'weekly' | 'monthly';
  priority: PlanPriority;
  confidence?: Confidence;
  /** A fixed cost paid from a savings goal first. */
  fundedByGoalId?: string | null;
  /** A savings transfer: the goal it fills. */
  goalId?: string | null;
  /** Per month ("2026-10"): what is still due that month; 0 means nothing that month. */
  amountByMonth?: Record<string, number>;
  /** Where it comes from in the user's records (for "Apply to my records"). */
  source?: { bucketId: string; itemId: string; recurring: boolean } | null;
}

export interface PlanGoal {
  id: string;
  name: string;
  current: number;
  target: number | null;
  deadline: Day | null;
  /** The saved monthly contribution. */
  monthly: number;
  /** The day of the month it is paid. */
  day: number;
  /** What is still to save this month (less than `monthly` once part is saved). Absent: the full amount. */
  dueThisMonth?: number | null;
  /** The savings items it comes from in the records. */
  sources?: { bucketId: string; itemId: string }[];
}

export interface Override {
  /** A new date; null puts it off to "Not scheduled". */
  date?: Day | null;
  skip?: boolean;
}

export interface MoneyScenario {
  horizon: MoneyHorizon;
  buffer: number;
  overrides: Record<string, Override>;
  /** Variable items forgone. */
  disabled: string[];
  /** Goal id → monthly amount, where changed. */
  goalMonthly: Record<string, number>;
  confirmedOnly: boolean;
}

export interface MoneyInput {
  today: Day;
  balance: number;
  items: PlanItem[];
  goals: PlanGoal[];
}

export interface Occ {
  /** itemId@baseDay, or itemId@none. */
  id: string;
  item: PlanItem;
  base: Day | null;
  date: Day | null;
  amount: number;
  skip: boolean;
  moved: boolean;
}

export interface Column {
  key: string;
  type: 'day' | 'week' | 'month';
  start: Day;
  end: Day;
  label: string;
  sub: string;
}

export const emptyScenario = (horizon: MoneyHorizon = '3m', buffer = 0): MoneyScenario => ({
  horizon,
  buffer,
  overrides: {},
  disabled: [],
  goalMonthly: {},
  confirmedOnly: false,
});

export const isLocked = (item: Pick<PlanItem, 'kind'>) => item.kind === 'income' || item.kind === 'fixed';

/** Repeats weekly or more often: grouped as "Weekly spending" in the list. */
export const isWeekly = (item: Pick<PlanItem, 'freq' | 'repeat'>) => item.freq === 'weekly' || item.repeat === 'weekly' || item.repeat === 'daily';

/** The message when a locked change is attempted. */
export const lockedMessage = (name: string) => `${name} is locked: income and fixed costs keep their dates.`;

// ---- Horizon ----

export function columnsFor(horizon: MoneyHorizon, today: Day): Column[] {
  const cols: Column[] = [];
  if (horizon === '1w') {
    for (let i = 0; i < 7; i++) {
      const t = today + i;
      cols.push({ key: `d${i}`, type: 'day', start: t, end: t, label: `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayOf(t)]} ${ymd(t).d}`, sub: i === 0 ? 'Today' : '' });
    }
  } else if (horizon === '4w') {
    const monday = today - weekdayOf(today);
    for (let w = 0; w < 4; w++) {
      const s = monday + w * 7;
      cols.push({ key: `w${w}`, type: 'week', start: Math.max(s, today), end: s + 6, label: `Week of ${shortDay(s)}`, sub: w === 0 ? 'This week' : '' });
    }
  } else {
    let { y, m } = ymd(today);
    const thisYear = y;
    for (let j = 0; j < (horizon === '3m' ? 3 : 6); j++) {
      const a = dayFrom(y, m, 1);
      cols.push({
        key: `m${y}-${m}`,
        type: 'month',
        start: Math.max(a, today),
        end: dayFrom(y, m, daysInMonth(y, m)),
        label: MONTH_LONG[m - 1] + (y !== thisYear ? ` ${y}` : ''),
        sub: j === 0 ? `From ${shortDay(today)}` : '',
      });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return cols;
}

export const columnOf = (cols: Column[], t: Day) => cols.find((c) => t >= c.start && t <= c.end) ?? null;

/** Where a card dropped on a column lands: the same weekday (weeks) or day of the month (months), clamped to the column. */
export function dateInColumn(o: Pick<Occ, 'date' | 'base'>, col: Column): Day {
  const base = o.date ?? o.base ?? col.start;
  let t: Day;
  if (col.type === 'day') t = col.start;
  else if (col.type === 'week') t = col.start - weekdayOf(col.start) + weekdayOf(base);
  else {
    const { y, m } = ymd(col.end);
    t = dayFrom(y, m, Math.min(ymd(base).d, daysInMonth(y, m)));
  }
  return Math.max(col.start, Math.min(col.end, t));
}

// ---- Occurrences ----

/** Savings transfers, one item per goal, at the scenario's monthly amount. */
export function goalItems(goals: PlanGoal[], scenario: MoneyScenario, today: Day): PlanItem[] {
  return goals
    .map((g) => {
      const amount = scenario.goalMonthly[g.id] ?? g.monthly;
      return {
      id: `save-${g.id}`,
      name: `Save: ${g.name}`,
      basketId: 'savings',
      basketName: 'Savings goals',
      kind: 'savings' as const,
      amount,
      freq: 'monthly' as const,
      dayOfMonth: g.day,
      until: g.deadline,
      priority: 'Should' as const,
      goalId: g.id,
      amountByMonth: g.dueThisMonth != null ? { [monthKeyOf(today)]: Math.min(amount, g.dueThisMonth) } : undefined,
    };
    })
    .filter((i) => i.amount > 0);
}

function baseDays(item: PlanItem, from: Day, to: Day): (Day | null)[] {
  if (item.freq === 'once') return [item.date ?? null];
  if (item.freq === 'dates') return (item.schedule ?? []).map((x) => x.day).filter((d) => d >= from && d <= to);
  const out: Day[] = [];
  if (item.freq === 'monthly') {
    let { y, m } = ymd(from);
    for (;;) {
      const t = dayFrom(y, m, Math.min(item.dayOfMonth ?? 1, daysInMonth(y, m)));
      if (t > to) break;
      if (t >= from && (item.until == null || t <= item.until)) out.push(t);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  } else {
    for (let t = from + ((item.weekday ?? 0) - weekdayOf(from) + 7) % 7; t <= to; t += 7) if (item.until == null || t <= item.until) out.push(t);
  }
  return out;
}

export function occurrencesOf(item: PlanItem, from: Day, to: Day, scenario: MoneyScenario): Occ[] {
  const locked = isLocked(item);
  const off = !locked && scenario.disabled.includes(item.id);
  const dropped = item.kind === 'income' && scenario.confirmedOnly && item.confidence === 'Expected';
  const out: Occ[] = [];
  for (const base of [...new Set(baseDays(item, from, to))]) {
    const amount =
      item.freq === 'dates'
        ? (item.schedule ?? []).filter((x) => x.day === base).reduce((a, x) => a + x.amount, 0)
        : base != null && item.amountByMonth
          ? (item.amountByMonth[monthKeyOf(base)] ?? item.amount)
          : item.amount;
    if (amount <= 0) continue;
    const id = `${item.id}@${base ?? 'none'}`;
    const ov = locked ? undefined : scenario.overrides[id];
    const hasDate = ov !== undefined && 'date' in ov;
    const date = hasDate ? (ov!.date ?? null) : base;
    out.push({ id, item, base, date, amount, skip: Boolean(ov?.skip) || off || dropped, moved: hasDate && date !== base });
  }
  return out;
}

export function buildOccurrences(input: MoneyInput, scenario: MoneyScenario, to: Day): Occ[] {
  return [...input.items, ...goalItems(input.goals, scenario, input.today)].flatMap((item) => occurrencesOf(item, input.today, to, scenario));
}

// ---- Simulation ----

export interface Simulation {
  points: [Day, number][];
  min: { value: number; day: Day };
  end: number;
  goals: Record<string, number>;
  /** Taken from goals per day, for goal-funded costs. */
  drawn: Record<number, number>;
  drawnTotal: number;
  drawnByGoal: Record<string, number>;
}

const counts = (o: Occ, from: Day, to: Day) => !o.skip && o.date != null && o.date >= from && o.date <= to;

export function simulate(input: MoneyInput, occ: Occ[], to: Day, extra: Occ[] = []): Simulation {
  const from = input.today;
  let balance = input.balance;
  const goals: Record<string, number> = Object.fromEntries(input.goals.map((g) => [g.id, g.current]));
  const byDay = new Map<number, Occ[]>();
  for (const o of [...occ, ...extra]) if (counts(o, from, to)) byDay.set(o.date!, [...(byDay.get(o.date!) ?? []), o]);
  const points: [Day, number][] = [];
  let min = { value: Infinity, day: from };
  const drawn: Record<number, number> = {};
  const drawnByGoal: Record<string, number> = {};
  let drawnTotal = 0;
  for (let t = from; t <= to; t++) {
    for (const o of byDay.get(t) ?? []) {
      const it = o.item;
      let amount = o.amount;
      if (it.kind === 'income') balance += amount;
      else if (it.kind === 'savings') {
        balance -= amount;
        if (it.goalId && it.goalId in goals) goals[it.goalId] += amount;
      } else {
        if (it.fundedByGoalId && it.fundedByGoalId in goals) {
          const take = Math.min(Math.max(0, goals[it.fundedByGoalId]), amount);
          goals[it.fundedByGoalId] -= take;
          amount -= take;
          drawn[t] = (drawn[t] ?? 0) + take;
          drawnByGoal[it.fundedByGoalId] = (drawnByGoal[it.fundedByGoalId] ?? 0) + take;
          drawnTotal += take;
        }
        balance -= amount;
      }
    }
    points.push([t, balance]);
    if (balance < min.value) min = { value: balance, day: t };
  }
  if (!points.length) min = { value: balance, day: from };
  return { points, min, end: balance, goals, drawn, drawnTotal, drawnByGoal };
}

// ---- Figures ----

export interface PeriodFigures {
  start: number;
  in: number;
  fixed: number;
  variable: number;
  savings: number;
  fromGoals: number;
  /** fixed + variable + savings − fromGoals. */
  out: number;
  end: number;
}

export interface Totals {
  income: number;
  fixed: number;
  variable: number;
  savings: number;
  fromGoals: number;
  /** basketId → total out (savings transfers under "savings"). */
  baskets: Record<string, number>;
}

export interface PlanRun {
  cols: Column[];
  end: Day;
  occ: Occ[];
  sim: Simulation;
  totals: Totals;
  periods: Record<string, PeriodFigures>;
  waterfall: { today: number; income: number; fixedFromWallet: number; leftToPlan: number; variable: number; savings: number; end: number };
}

export function runPlan(input: MoneyInput, scenario: MoneyScenario): PlanRun {
  const cols = columnsFor(scenario.horizon, input.today);
  const end = cols[cols.length - 1].end;
  const occ = buildOccurrences(input, scenario, end);
  const sim = simulate(input, occ, end);
  const totals: Totals = { income: 0, fixed: 0, variable: 0, savings: 0, fromGoals: sim.drawnTotal, baskets: {} };
  const periods: Record<string, PeriodFigures> = Object.fromEntries(cols.map((c) => [c.key, { start: 0, in: 0, fixed: 0, variable: 0, savings: 0, fromGoals: 0, out: 0, end: 0 }]));
  for (const o of occ) {
    if (!counts(o, input.today, end)) continue;
    const k = o.item.kind;
    if (k === 'income') totals.income += o.amount;
    else {
      totals[k] += o.amount;
      totals.baskets[o.item.basketId] = (totals.baskets[o.item.basketId] ?? 0) + o.amount;
    }
    const col = columnOf(cols, o.date!);
    if (col) {
      const p = periods[col.key];
      if (k === 'income') p.in += o.amount;
      else p[k] += o.amount;
    }
  }
  for (const [t, v] of Object.entries(sim.drawn)) {
    const col = columnOf(cols, Number(t));
    if (col) periods[col.key].fromGoals += v;
  }
  let prev = input.balance;
  const byDay = new Map(sim.points);
  for (const c of cols) {
    const p = periods[c.key];
    p.start = prev;
    p.end = byDay.get(c.end) ?? prev;
    p.out = p.fixed + p.variable + p.savings - p.fromGoals;
    prev = p.end;
  }
  const fixedFromWallet = totals.fixed - totals.fromGoals;
  const leftToPlan = input.balance + totals.income - fixedFromWallet;
  return {
    cols,
    end,
    occ,
    sim,
    totals,
    periods,
    waterfall: { today: input.balance, income: totals.income, fixedFromWallet, leftToPlan, variable: totals.variable, savings: totals.savings, end: leftToPlan - totals.variable - totals.savings },
  };
}

/** The same horizon, buffer and income switch with none of the user's changes. */
export const startingScenario = (s: MoneyScenario): MoneyScenario => ({ ...emptyScenario(s.horizon, s.buffer), confirmedOnly: s.confirmedOnly });

// ---- Changes ----

export interface ChangeCount {
  moved: number;
  skipped: number;
  forgone: number;
  goals: number;
  total: number;
}

export function countChanges(input: MoneyInput, s: MoneyScenario): ChangeCount {
  let moved = 0;
  let skipped = 0;
  for (const [id, ov] of Object.entries(s.overrides)) {
    if (ov.skip) skipped += 1;
    else if ('date' in ov && String(ov.date ?? 'none') !== id.slice(id.lastIndexOf('@') + 1)) moved += 1;
  }
  const goals = input.goals.filter((g) => g.id in s.goalMonthly && s.goalMonthly[g.id] !== g.monthly).length;
  const forgone = s.disabled.length;
  return { moved, skipped, forgone, goals, total: moved + skipped + forgone + goals };
}

export function describeChanges(c: ChangeCount): string {
  const parts: string[] = [];
  if (c.moved) parts.push(`${c.moved} moved`);
  if (c.skipped) parts.push(`${c.skipped} skipped`);
  if (c.forgone) parts.push(`${c.forgone} basket item${c.forgone > 1 ? 's' : ''} forgone`);
  if (c.goals) parts.push(`${c.goals} goal amount${c.goals > 1 ? 's' : ''} changed`);
  return parts.length ? `Your changes: ${parts.join(', ')}.` : 'No changes yet. Move or skip something to compare.';
}

export type ChangeResult = { ok: true; scenario: MoneyScenario; message: string } | { ok: false; message: string };

function findOcc(input: MoneyInput, s: MoneyScenario, id: string): Occ | null {
  const cols = columnsFor(s.horizon, input.today);
  const itemId = id.slice(0, id.lastIndexOf('@'));
  const item = [...input.items, ...goalItems(input.goals, s, input.today)].find((i) => i.id === itemId);
  if (!item) return null;
  return occurrencesOf(item, input.today, cols[cols.length - 1].end, s).find((o) => o.id === id) ?? null;
}

const withOverride = (s: MoneyScenario, id: string, patch: Override): MoneyScenario => ({ ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } } });

/** Changes a flexible occurrence's date, clamped to today and the horizon end. Locked: refused. */
export function setDate(input: MoneyInput, s: MoneyScenario, id: string, day: Day): ChangeResult {
  const o = findOcc(input, s, id);
  if (!o) return { ok: false, message: 'This item is no longer in the plan.' };
  if (isLocked(o.item)) return { ok: false, message: lockedMessage(o.item.name) };
  const cols = columnsFor(s.horizon, input.today);
  const t = Math.max(input.today, Math.min(cols[cols.length - 1].end, day));
  return { ok: true, scenario: withOverride(s, id, { date: t }), message: `${o.item.name} moved to ${dayWords(t)}` };
}

/** Board drop or "Move to": a column key, or "park" for Not scheduled (variable costs only). */
export function moveTo(input: MoneyInput, s: MoneyScenario, id: string, target: string): ChangeResult {
  const o = findOcc(input, s, id);
  if (!o) return { ok: false, message: 'This item is no longer in the plan.' };
  if (isLocked(o.item)) return { ok: false, message: lockedMessage(o.item.name) };
  if (target === 'park') {
    if (o.item.kind !== 'variable') return { ok: false, message: 'Only variable costs can be taken out of the plan.' };
    return { ok: true, scenario: withOverride(s, id, { date: null }), message: `${o.item.name} moved to Not scheduled` };
  }
  const col = columnsFor(s.horizon, input.today).find((c) => c.key === target);
  if (!col) return { ok: false, message: 'That period is not in the plan.' };
  const t = dateInColumn(o, col);
  return { ok: true, scenario: withOverride(s, id, { date: t }), message: `${o.item.name} moved to ${dayWords(t)}` };
}

export function toggleSkip(input: MoneyInput, s: MoneyScenario, id: string): ChangeResult {
  const o = findOcc(input, s, id);
  if (!o) return { ok: false, message: 'This item is no longer in the plan.' };
  if (isLocked(o.item)) return { ok: false, message: lockedMessage(o.item.name) };
  const skip = !s.overrides[id]?.skip;
  return { ok: true, scenario: withOverride(s, id, { skip }), message: skip ? `${o.item.name} skipped` : `${o.item.name} restored` };
}

export function originalDate(input: MoneyInput, s: MoneyScenario, id: string): ChangeResult {
  const o = findOcc(input, s, id);
  if (!o) return { ok: false, message: 'This item is no longer in the plan.' };
  if (isLocked(o.item)) return { ok: false, message: lockedMessage(o.item.name) };
  const rest = { ...s.overrides };
  const cur = rest[id];
  if (cur?.skip) rest[id] = { skip: true };
  else delete rest[id];
  return { ok: true, scenario: { ...s, overrides: rest }, message: 'Back to its original date' };
}

/** Untick (forgo) or tick a variable item. Locked: refused. */
export function toggleItem(input: MoneyInput, s: MoneyScenario, itemId: string): ChangeResult {
  const item = input.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: 'This item is no longer in the plan.' };
  if (isLocked(item)) return { ok: false, message: lockedMessage(item.name) };
  const off = s.disabled.includes(itemId);
  return {
    ok: true,
    scenario: { ...s, disabled: off ? s.disabled.filter((x) => x !== itemId) : [...s.disabled, itemId] },
    message: off ? `${item.name} is back in the plan` : `${item.name} forgone`,
  };
}

export function setGoalMonthly(input: MoneyInput, s: MoneyScenario, goalId: string, monthly: number): MoneyScenario {
  const goal = input.goals.find((g) => g.id === goalId);
  const next = { ...s.goalMonthly };
  if (goal && Math.round(monthly) === Math.round(goal.monthly)) delete next[goalId];
  else next[goalId] = Math.max(0, Math.round(monthly));
  return { ...s, goalMonthly: next };
}

const dayWords = (t: Day) => `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayOf(t)]} ${shortDay(t)}`;

// ---- Advice ----

/** The first week start where adding a wish keeps the lowest balance at or above the buffer. */
export function earliestAffordable(input: MoneyInput, run: PlanRun, o: Occ, buffer: number): Day | null {
  const rest = run.occ.filter((q) => q.id !== o.id);
  for (let t = input.today; t <= run.end; t += 7) {
    const sim = simulate(input, rest, run.end, [{ ...o, date: t, skip: false }]);
    if (sim.min.value >= buffer) return t;
  }
  return null;
}

export interface Fix {
  action: 'move' | 'skip' | 'goal';
  occId?: string;
  date?: Day;
  goalId?: string;
  monthly?: number;
  name: string;
  amount: number;
  from?: Day | null;
  toLabel?: string;
  /** The lowest balance once applied. */
  lowest: number;
}

/** Up to three changes to flexible items that raise the lowest point (section 7). Never locked items. */
export function suggestFixes(input: MoneyInput, s: MoneyScenario, run: PlanRun): Fix[] {
  if (run.sim.min.value >= s.buffer) return [];
  const minT = run.sim.min.day;
  const later = run.cols.filter((c) => c.start > minT);
  const options: (Fix & { key: string })[] = [];
  for (const o of run.occ) {
    if (o.skip || o.date == null || o.date > minT || o.date < input.today || o.item.kind !== 'variable' || o.item.priority === 'Must') continue;
    const rest = run.occ.filter((q) => q.id !== o.id);
    if (later.length) {
      const col = later[later.length - 1];
      const t = dateInColumn(o, col);
      options.push({ key: o.item.id, action: 'move', occId: o.id, date: t, name: o.item.name, amount: o.amount, from: o.date, toLabel: col.label, lowest: simulate(input, rest, run.end, [{ ...o, date: t }]).min.value });
    } else {
      options.push({ key: o.item.id, action: 'skip', occId: o.id, name: o.item.name, amount: o.amount, from: o.date, lowest: simulate(input, rest, run.end).min.value });
    }
  }
  for (const g of input.goals) {
    const old = s.goalMonthly[g.id] ?? g.monthly;
    if (old < 10_000) continue;
    const cut = Math.min(old, 20_000);
    const next = { ...s, goalMonthly: { ...s.goalMonthly, [g.id]: old - cut } };
    const lowest = simulate(input, buildOccurrences(input, next, run.end), run.end).min.value;
    options.push({ key: `g${g.id}`, action: 'goal', goalId: g.id, monthly: old - cut, name: g.name, amount: cut, lowest });
  }
  const seen = new Set<string>();
  const good = options
    .filter((o) => o.lowest > run.sim.min.value + 1)
    .sort((a, b) => b.lowest - a.lowest)
    .filter((o) => (seen.has(o.key) ? false : (seen.add(o.key), true)));
  const goals = good.filter((o) => o.action === 'goal');
  const items = good.filter((o) => o.action !== 'goal');
  return [goals[0], items[0], items[1] ?? goals[1]]
    .filter((x): x is Fix & { key: string } => Boolean(x))
    .sort((a, b) => b.lowest - a.lowest)
    .map((x) => {
      const fix: Fix & { key?: string } = { ...x };
      delete fix.key;
      return fix;
    });
}

export function applyFix(input: MoneyInput, s: MoneyScenario, fix: Fix): ChangeResult {
  if (fix.action === 'goal' && fix.goalId != null && fix.monthly != null) return { ok: true, scenario: setGoalMonthly(input, s, fix.goalId, fix.monthly), message: 'Change applied' };
  if (fix.action === 'move' && fix.occId && fix.date != null) {
    const r = setDate(input, s, fix.occId, fix.date);
    return r.ok ? { ...r, message: 'Change applied' } : r;
  }
  if (fix.action === 'skip' && fix.occId) {
    const o = findOcc(input, s, fix.occId);
    if (!o || isLocked(o.item)) return { ok: false, message: o ? lockedMessage(o.item.name) : 'This item is no longer in the plan.' };
    return { ok: true, scenario: withOverride(s, fix.occId, { skip: true }), message: 'Change applied' };
  }
  return { ok: false, message: 'This change can no longer be made.' };
}

// ---- Goals ----

export interface GoalView {
  goal: PlanGoal;
  monthly: number;
  /** What it will hold by its deadline (or the horizon end without one). */
  atDeadline: number;
  onTrack: boolean;
  /** At least this a month to reach the target in time (rounded up to 1,000). */
  needed: number;
  by: Day;
}

export function monthsUntil(today: Day, deadline: Day, contributionDay: number): number {
  const a = ymd(today);
  const b = ymd(deadline);
  return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m) + (b.d >= contributionDay ? 1 : 0));
}

export function goalViews(input: MoneyInput, s: MoneyScenario, run: PlanRun): GoalView[] {
  return input.goals.map((g) => {
    const by = g.deadline != null && g.deadline >= input.today ? g.deadline : run.end;
    const sim = simulate(input, buildOccurrences(input, s, by), by);
    // Before anything is paid out of it on the deadline.
    const atDeadline = (sim.goals[g.id] ?? g.current) + (sim.drawnByGoal[g.id] ?? 0);
    const target = g.target ?? 0;
    const months = monthsUntil(input.today, by, g.day);
    const needed = target > 0 ? Math.max(0, Math.ceil((target - g.current) / months / 1000) * 1000) : 0;
    return { goal: g, monthly: s.goalMonthly[g.id] ?? g.monthly, atDeadline, onTrack: target <= 0 || atDeadline >= target - 0.5, needed, by };
  });
}

// ---- The month's priorities ----

export interface MonthPriorities {
  month: string;
  monthEnd: Day;
  receive: number;
  pay: number;
  save: number;
  variable: number;
  endWith: number;
}

export function monthPriorities(input: MoneyInput, s: MoneyScenario): MonthPriorities {
  const { y, m } = ymd(input.today);
  const monthEnd = dayFrom(y, m, daysInMonth(y, m));
  const occ = buildOccurrences(input, s, monthEnd);
  const sum = (k: PlanKind) => occ.filter((o) => counts(o, input.today, monthEnd) && o.item.kind === k).reduce((a, o) => a + o.amount, 0);
  return {
    month: MONTH_LONG[m - 1],
    monthEnd,
    receive: sum('income'),
    pay: sum('fixed'),
    save: sum('savings'),
    variable: sum('variable'),
    endWith: simulate(input, occ, monthEnd).end,
  };
}

// ---- Everything the page shows ----

export function moneyPlan(input: MoneyInput, s: MoneyScenario) {
  const run = runPlan(input, s);
  const start = runPlan(input, startingScenario(s));
  const changes = countChanges(input, s);
  const dip = run.sim.points.find((p) => p[1] < s.buffer) ?? null;
  return {
    run,
    start,
    changes,
    dip,
    fixes: suggestFixes(input, s, run),
    goals: goalViews(input, s, run),
    priorities: monthPriorities(input, s),
  };
}

export type MoneyPlanView = ReturnType<typeof moneyPlan>;
