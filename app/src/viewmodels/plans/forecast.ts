// Plans forecast — where existing plans and commitments are heading. Pure.
//
// Per month:
//   income      = income items due that month (recurring rules and one-offs)
//                 + an estimate for irregular income (weighted 6-month
//                 average of income no item covers), labelled "estimated";
//   committed   = fixed and savings items due that month (what's left to pay);
//   variable    = the month's variable plan if set, else the usual 6-month
//                 variable spending (including typical unplanned spending);
//   free money  = income − committed − variable (what's free for plans);
//   plan payments = plan items due that month (what's left to pay);
//   balance     = carried month to month from availableNow: + free − plans.
// Cautious: income at the low end of recent months and variable spending at
// the high end; Optimistic the reverse. Overdue items land in the current
// month. Under 3 months of history the forecast is "low confidence".

import { isOpen, monthKey, r2, relevant, remaining, shiftMonth, type Need, type Occurrence } from './model';

export type Scenario = 'cautious' | 'expected' | 'optimistic';
export type Status = 'on_track' | 'watch' | 'off_track';

export interface ForecastInput {
  today: Date;
  occurrences: Occurrence[];
  /** Income received this month − money spent this month. */
  availableNow: number;
  /** Weighted 6-month average of income that no budget item covers. */
  irregularIncome: number;
  /** Last 6 whole months' total income, and variable spending (incl. unplanned). */
  incomeHistory: number[];
  variableHistory: number[];
  /** A month's variable plan (sum of its variable items), 0 when none. */
  variablePlan: (month: string) => number;
  /** Variable money already spent this month. */
  variableSpentThisMonth: number;
  historyMonths: number;
}

export interface WhatIf {
  /** New due date per occurrence key (a postponement). */
  moves: Record<string, Date>;
  /** Occurrence keys dropped. */
  drops: string[];
  /** Extra expected income or expense. */
  extras: { id: string; name: string; month: string; kind: 'income' | 'expense'; amount: number }[];
}

export const NO_WHAT_IF: WhatIf = { moves: {}, drops: [], extras: [] };

export function hasWhatIf(w: WhatIf) {
  return Object.keys(w.moves).length > 0 || w.drops.length > 0 || w.extras.length > 0;
}

/** The occurrences with a what-if's moves and drops applied. */
export function applyWhatIf(occurrences: Occurrence[], w: WhatIf): Occurrence[] {
  if (!hasWhatIf(w)) return occurrences;
  return occurrences.map((o) => {
    const moved = w.moves[o.key];
    const dropped = w.drops.includes(o.key);
    if (!moved && !dropped) return o;
    return { ...o, due: moved ?? o.due, month: moved ? monthKey(moved) : o.month, postponed: o.postponed || Boolean(moved), dropped: o.dropped || dropped };
  });
}

function mean(v: number[]) {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}
function stdDev(v: number[]) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}
export function weightedAverage(values: number[]) {
  let total = 0;
  let weights = 0;
  values.forEach((v, i) => {
    total += v * (i + 1);
    weights += i + 1;
  });
  return weights ? total / weights : 0;
}

/** The month an open occurrence counts in: overdue ones in the current month. */
function effectiveMonth(o: Occurrence, current: string) {
  const m = o.due ? monthKey(o.due) : o.month;
  return m < current ? current : m;
}

export interface ForecastMonth {
  month: string;
  current: boolean;
  income: number;
  incomeEstimated: number;
  committed: number;
  variable: number;
  /** Free for plans: income − committed − variable. */
  free: number;
  planPayments: number;
  mustPlan: number;
  nicePlan: number;
  balance: number;
}

export interface PlansForecast {
  months: ForecastMonth[];
  lowConfidence: boolean;
  startBalance: number;
}

export function plansForecast(input: ForecastInput, horizon: number, scenario: Scenario, whatIf: WhatIf = NO_WHAT_IF): PlansForecast {
  const current = monthKey(input.today);
  const occ = applyWhatIf(input.occurrences, whatIf).filter((o) => isOpen(o) && relevant(o, input.today));
  const incomeSd = stdDev(input.incomeHistory);
  const variableAvg = input.variableHistory.length ? weightedAverage(input.variableHistory) : 0;
  const variableSd = stdDev(input.variableHistory);
  let balance = input.availableNow;
  const months: ForecastMonth[] = [];
  for (let i = 0; i < horizon; i++) {
    const m = shiftMonth(current, i);
    const isCurrent = i === 0;
    const inMonth = occ.filter((o) => effectiveMonth(o, current) === m);
    const sum = (list: Occurrence[]) => list.reduce((s, o) => s + remaining(o), 0);
    const extras = whatIf.extras.filter((x) => x.month === m);
    const extraIncome = extras.filter((x) => x.kind === 'income').reduce((s, x) => s + x.amount, 0);
    const extraExpense = extras.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.amount, 0);

    // Income: the current month only counts what's still expected.
    const estimated = isCurrent ? 0 : input.irregularIncome;
    let income = sum(inMonth.filter((o) => o.kind === 'income')) + estimated + extraIncome;
    const committed = sum(inMonth.filter((o) => (o.kind === 'fixed' || o.kind === 'savings') && !o.inPlan)) + extraExpense;
    const plan = inMonth.filter((o) => o.inPlan && o.kind !== 'income');
    const planned = input.variablePlan(m);
    let variable = planned > 0 ? planned : variableAvg;
    if (isCurrent) variable = Math.max(0, variable - input.variableSpentThisMonth);
    if (!isCurrent && scenario !== 'expected') {
      income = Math.max(0, income + (scenario === 'cautious' ? -incomeSd : incomeSd));
      variable = Math.max(0, variable + (scenario === 'cautious' ? variableSd : -variableSd));
    }
    const free = income - committed - variable;
    const planPayments = sum(plan);
    balance += free - planPayments;
    months.push({
      month: m,
      current: isCurrent,
      income: r2(income),
      incomeEstimated: r2(estimated),
      committed: r2(committed),
      variable: r2(variable),
      free: r2(free),
      planPayments: r2(planPayments),
      mustPlan: r2(sum(plan.filter((o) => o.need === 'must'))),
      nicePlan: r2(sum(plan.filter((o) => o.need === 'nice'))),
      balance: r2(balance),
    });
  }
  return { months, lowConfidence: input.historyMonths < 3, startBalance: r2(input.availableNow) };
}

/** Money free for plans in each coming month (after that month's own plan payments). */
export function capacityAfterCurrent(f: PlansForecast) {
  return f.months.filter((m) => !m.current).map((m) => ({ month: m.month, free: m.free - m.planPayments }));
}

// ---------------------------------------------------------------------------
// Plans: on schedule?

export interface PlanRow {
  bucketId: string;
  name: string;
  paid: number;
  remaining: number;
  /** Month of the latest item due date. */
  targetEnd: string | null;
  /** Month the last payment is expected to be affordable, or null (not within the forecast). */
  forecastEnd: string | null;
  monthsLate: number;
  monthsLeft: number;
  setAside: number;
}

/**
 * Pays every plan's items in due order out of the running money (available
 * now, then each month's free money), carrying an item that doesn't fit
 * to the next month — so a plan finishes when its last item is paid.
 */
export function planSchedule(input: ForecastInput, scenario: Scenario, whatIf: WhatIf = NO_WHAT_IF, lookahead = 24): PlanRow[] {
  const current = monthKey(input.today);
  const all = applyWhatIf(input.occurrences, whatIf);
  const planItems = all.filter((o) => o.inPlan && o.kind !== 'income' && !o.dropped);
  const f = plansForecast(input, lookahead, scenario, whatIf);
  const paidMonth = new Map<string, string>();
  const queue = planItems.filter((o) => isOpen(o) && relevant(o, input.today)).sort((a, b) => effectiveMonth(a, current).localeCompare(effectiveMonth(b, current)) || (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  let pot = input.availableNow;
  for (const m of f.months) {
    pot += m.free;
    for (const item of queue) {
      if (paidMonth.has(item.key) || effectiveMonth(item, current) > m.month) continue;
      const rem = remaining(item);
      if (rem <= pot + 0.005) {
        pot -= rem;
        paidMonth.set(item.key, m.month);
      }
    }
  }
  const byPlan = new Map<string, Occurrence[]>();
  for (const o of planItems) byPlan.set(o.bucketId, [...(byPlan.get(o.bucketId) ?? []), o]);
  return [...byPlan.entries()]
    .map(([bucketId, items]) => {
      const open = items.filter(isOpen);
      const rem = r2(open.reduce((s, o) => s + remaining(o), 0));
      const dues = items.map((o) => (o.due ? monthKey(o.due) : o.month)).sort();
      const targetEnd = dues.length ? dues[dues.length - 1] : null;
      const ends = open.map((o) => paidMonth.get(o.key));
      const forecastEnd = !open.length ? current : ends.some((e) => !e) ? null : [...(ends as string[])].sort().at(-1)!;
      const monthsBetween = (a: string, b: string) => {
        const [ay, am] = a.split('-').map(Number);
        const [by, bm] = b.split('-').map(Number);
        return (by - ay) * 12 + (bm - am);
      };
      const monthsLeft = targetEnd ? Math.max(1, monthsBetween(current, targetEnd) + 1) : 1;
      return {
        bucketId,
        name: items[0].bucketName,
        paid: r2(items.reduce((s, o) => s + o.paid, 0)),
        remaining: rem,
        targetEnd,
        forecastEnd,
        monthsLate: targetEnd && forecastEnd ? Math.max(0, monthsBetween(targetEnd, forecastEnd)) : forecastEnd === null && rem > 0 ? Infinity : 0,
        monthsLeft,
        setAside: r2(rem / monthsLeft),
      };
    })
    .filter((p) => p.remaining > 0 || p.paid > 0)
    .sort((a, b) => b.remaining - a.remaining);
}

// ---------------------------------------------------------------------------
// Statuses, summaries and guidance

export function affordStatus(f: PlansForecast): Status {
  const lowest = Math.min(...f.months.map((m) => m.balance));
  if (lowest < 0) return 'off_track';
  const plans = f.months.reduce((s, m) => s + m.planPayments, 0);
  return plans > 0 && lowest < plans * 0.1 ? 'watch' : 'on_track';
}

export function scheduleStatus(rows: PlanRow[]): Status {
  const late = rows.filter((r) => r.remaining > 0 && r.monthsLate > 0);
  if (!late.length) return 'on_track';
  return late.some((r) => r.monthsLate > 1) ? 'off_track' : 'watch';
}

export interface Tip {
  text: string;
  action: string;
  href: string;
}

export function plansGuidance(f: PlansForecast, occurrences: Occurrence[], today: Date, currency: string): Tip[] {
  const tips: Tip[] = [];
  const m = (n: number) => `${Math.round(n).toLocaleString('en-US')} ${currency}`;
  const current = monthKey(today);
  const name = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'long' });

  const short = f.months.find((x) => x.balance < 0);
  if (short) {
    const gap = -short.balance;
    const nice = occurrences
      .filter((o) => isOpen(o) && o.inPlan && o.need === 'nice' && effectiveMonth(o, current) <= short.month)
      .sort((a, b) => remaining(b) - remaining(a));
    let freed = 0;
    const picks: Occurrence[] = [];
    for (const o of nice) {
      if (freed >= gap) break;
      picks.push(o);
      freed += remaining(o);
    }
    const monthsTo = Math.max(1, f.months.indexOf(short) + 1);
    const rest = Math.max(0, gap - freed);
    const parts = [picks.length ? `Postpone ${picks.length} nice-to-${picks.length === 1 ? 'have' : 'haves'} (${m(freed)})` : ''];
    if (rest > 0) parts.push(`${parts[0] ? 'and set' : 'Set'} aside ${m(Math.ceil(rest / monthsTo / 1000) * 1000)} a month`);
    tips.push({ text: `${name(short.month)} is ${m(gap)} short. ${parts.filter(Boolean).join(' ')}.`, action: 'Review in Priorities', href: '/buckets/items' });
  }
  const idle = f.months.find((x) => !x.current && x.planPayments === 0 && x.free > 0 && x.balance > 0);
  if (idle) tips.push({ text: `You'll have ${m(idle.free)} free in ${name(idle.month)} with nothing planned.`, action: 'Plan in buckets', href: '/buckets' });
  // Two big commitments landing in the same month.
  for (const x of f.months) {
    const big = occurrences
      .filter((o) => isOpen(o) && o.kind !== 'income' && effectiveMonth(o, current) === x.month && remaining(o) >= Math.max(1, x.income) * 0.2)
      .sort((a, b) => remaining(b) - remaining(a));
    if (big.length >= 2 && big.some((o) => o.inPlan)) {
      const plan = big.find((o) => o.inPlan)!;
      const other = big.find((o) => o !== plan)!;
      tips.push({ text: `${plan.name} lands in the same month as ${other.name} (${name(x.month)}).`, action: 'Adjust dates', href: '#whatif' });
      break;
    }
  }
  return tips.slice(0, 3);
}

export function needSplit(list: Occurrence[]): Record<Need, number> {
  return {
    must: r2(list.filter((o) => o.need === 'must').reduce((s, o) => s + remaining(o), 0)),
    nice: r2(list.filter((o) => o.need === 'nice').reduce((s, o) => s + remaining(o), 0)),
  };
}

export { effectiveMonth };
