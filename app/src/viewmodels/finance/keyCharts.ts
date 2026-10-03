// Finance Insights — the four "Key charts". Each always shows a trend: a
// window of intervals ending at the selected period, not just the period.
//   Week / Month (and Day): the last 12 months, ending at the selected month
//   Quarter:               the last 8 quarters
//   Year / All time:        monthly for up to 24 months, quarterly beyond
//   Custom:                 monthly within the range (at least 3 months)
// Intervals with no recorded transactions are gaps (null), not zeros; the
// current, unfinished interval is flagged "so far" and kept out of
// averages and ratings. Each chart returns { status, summary, blocks }.
// Pure.

import type { FinData } from './types';
import {
  endOfDay,
  inPeriod,
  monthKey,
  monthName,
  monthStart,
  monthEnd,
  shiftMonthKey,
  type Period,
} from './ranges';
import { historyMonths, monthTotal, r2 } from './metrics';

export type Status = 'on_track' | 'watch' | 'off_track';

export interface KeyInterval {
  key: string;
  start: Date;
  end: Date;
  /** "Mar", "Q2 26" */
  label: string;
  /** "March 2026", "Q2 2026" */
  long: string;
  /** Inside the selected period. */
  selected: boolean;
  /** Still running (ends after today): drawn lighter, "so far". */
  current: boolean;
  /** Any transaction recorded in it. */
  hasData: boolean;
}

export interface KeyWindow {
  granularity: 'month' | 'quarter';
  intervals: KeyInterval[];
  /** "Oct 2025 to Sep 2026" */
  label: string;
  /** Set when the window had to be widened (short custom range). */
  note: string | null;
}

export interface KeyBlock<T = unknown> {
  title: string;
  type: 'bar' | 'grouped-bar' | 'line' | 'area-line';
  data: T;
  caption: string;
}

export interface KeyChart<T = unknown> {
  status: Status;
  summary: string;
  blocks: KeyBlock<T>[];
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function quarterStart(d: Date) {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function keyWindow(data: Pick<FinData, 'today' | 'txs' | 'firstMonth'>, period: Period): KeyWindow {
  const today = data.today;
  const currentMonth = monthKey(today);
  // Never reach past the current month.
  const lastMonth = [monthKey(period.end), currentMonth].sort()[0];
  const hasTx = new Set(data.txs.map((t) => t.month));
  const months = (from: string, to: string): KeyInterval[] => {
    const out: KeyInterval[] = [];
    for (let m = from; m <= to; m = shiftMonthKey(m, 1)) {
      const start = monthStart(m);
      const end = monthEnd(m);
      out.push({
        key: m,
        start,
        end,
        label: SHORT[start.getMonth()],
        long: `${monthName(m)} ${start.getFullYear()}`,
        selected: start <= period.end && end >= period.start,
        current: end > endOfDay(today),
        hasData: hasTx.has(m),
      });
    }
    return out;
  };
  const quarters = (from: Date, count: number): KeyInterval[] =>
    Array.from({ length: count }, (_, i) => {
      const start = new Date(from.getFullYear(), from.getMonth() + i * 3, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 0, 23, 59, 59, 999);
      const q = start.getMonth() / 3 + 1;
      const keys = [0, 1, 2].map((k) => monthKey(new Date(start.getFullYear(), start.getMonth() + k, 1)));
      return {
        key: `${start.getFullYear()}Q${q}`,
        start,
        end,
        label: `Q${q} ${String(start.getFullYear()).slice(2)}`,
        long: `Q${q} ${start.getFullYear()}`,
        selected: start <= period.end && end >= period.start,
        current: end > endOfDay(today),
        hasData: keys.some((k) => hasTx.has(k)),
      };
    });

  let intervals: KeyInterval[];
  let note: string | null = null;
  let granularity: KeyWindow['granularity'] = 'month';
  switch (period.kind) {
    case 'quarter': {
      granularity = 'quarter';
      const endQ = quarterStart(period.end > today ? today : period.end);
      intervals = quarters(new Date(endQ.getFullYear(), endQ.getMonth() - 21, 1), 8);
      break;
    }
    case 'year':
    case 'all': {
      const first = period.kind === 'all' ? (data.firstMonth ?? lastMonth) : shiftMonthKey(lastMonth, -23);
      const span = monthsBetween(first, lastMonth) + 1;
      if (span <= 24) {
        intervals = months(first, lastMonth);
      } else {
        granularity = 'quarter';
        const firstQ = quarterStart(monthStart(first));
        const lastQ = quarterStart(monthStart(lastMonth));
        const count = (lastQ.getFullYear() - firstQ.getFullYear()) * 4 + (lastQ.getMonth() - firstQ.getMonth()) / 3 + 1;
        intervals = quarters(firstQ, count);
      }
      break;
    }
    case 'custom': {
      const from = monthKey(period.start);
      if (monthsBetween(from, lastMonth) + 1 < 3) {
        intervals = months(shiftMonthKey(lastMonth, -2), lastMonth);
        note = 'Your range is shorter than 3 months, so these charts show the last 3.';
      } else {
        intervals = months(from, lastMonth);
      }
      break;
    }
    default:
      intervals = months(shiftMonthKey(lastMonth, -11), lastMonth);
  }
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  const fmt = (d: Date) => `${SHORT[d.getMonth()]} ${d.getFullYear()}`;
  return { granularity, intervals, label: `${fmt(first.start)} to ${fmt(last.start)}`, note };
}

function sumIn(data: FinData, iv: KeyInterval, kind: 'income' | 'expense', earnedOnly = false) {
  return data.txs.filter((t) => t.kind === kind && inPeriod(t.date, iv) && !(earnedOnly && t.borrowed)).reduce((s, t) => s + t.amount, 0);
}

function plannedIncomeIn(data: FinData, iv: KeyInterval) {
  let total = 0;
  for (let m = monthKey(iv.start); m <= monthKey(iv.end); m = shiftMonthKey(m, 1)) total += data.plan(m).plannedIncome;
  return total;
}

function money(n: number) {
  return Math.round(n).toLocaleString('en-US');
}

/** "March and July", "March, July and May" */
function listNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function nameOf(iv: KeyInterval, w: KeyWindow) {
  return w.granularity === 'quarter' ? iv.long : monthName(iv.key);
}

const unit = (w: KeyWindow) => (w.granularity === 'quarter' ? 'quarter' : 'month');
const units = (w: KeyWindow) => (w.granularity === 'quarter' ? 'quarters' : 'months');

// ---------------------------------------------------------------------------
// 1. Is my income consistent?

export interface IncomePoint {
  interval: KeyInterval;
  income: number | null;
  expected: number | null;
  tone: 'within' | 'below' | 'above' | null;
}

export interface IncomeConsistencyData {
  points: IncomePoint[];
  average: number;
  low: number;
  high: number;
  rating: 'Steady' | 'Somewhat variable' | 'Highly variable' | null;
  outside: number;
  judged: number;
}

export function incomeConsistency(data: FinData, w: KeyWindow): KeyChart<IncomeConsistencyData> {
  // Consistency is about earned income: a loan in one month isn't a raise.
  const raw = w.intervals.map((iv) => ({ iv, income: iv.hasData ? r2(sumIn(data, iv, 'income', true)) : null, expected: r2(plannedIncomeIn(data, iv)) }));
  const complete = raw.filter((x) => x.income !== null && !x.iv.current);
  const average = complete.length ? complete.reduce((s, x) => s + (x.income ?? 0), 0) / complete.length : 0;
  const low = average * 0.9;
  const high = average * 1.1;
  const points: IncomePoint[] = raw.map((x) => ({
    interval: x.iv,
    income: x.income,
    expected: x.expected > 0 ? x.expected : null,
    tone: x.income === null || x.iv.current || average <= 0 ? null : x.income < low ? 'below' : x.income > high ? 'above' : 'within',
  }));
  const judgedPoints = points.filter((p) => p.tone !== null);
  const outside = judgedPoints.filter((p) => p.tone !== 'within').length;
  const rating = judgedPoints.length < 2 ? null : outside <= 1 ? 'Steady' : outside <= 3 ? 'Somewhat variable' : 'Highly variable';
  const status: Status = rating === 'Highly variable' ? 'off_track' : rating === 'Somewhat variable' ? 'watch' : 'on_track';
  const lowNames = judgedPoints.filter((p) => p.tone === 'below').map((p) => nameOf(p.interval, w));
  const highNames = judgedPoints.filter((p) => p.tone === 'above').map((p) => nameOf(p.interval, w));
  let caption: string;
  if (!judgedPoints.length) caption = `No income recorded in this window yet.`;
  else {
    caption = `Income stayed within 10% of your average in ${judgedPoints.length - outside} of ${judgedPoints.length} ${units(w)}`;
    const notes = [lowNames.length ? `${listNames(lowNames)} ${lowNames.length === 1 ? 'was' : 'were'} low` : '', highNames.length ? `${listNames(highNames)} ${highNames.length === 1 ? 'was' : 'were'} high` : ''].filter(Boolean);
    caption += notes.length ? `; ${notes.join(', ')}.` : '.';
  }
  return {
    status,
    summary: rating ? `${rating}: ${outside} ${outside === 1 ? unit(w) : units(w)} outside your normal range.` : 'Not enough income history to judge yet.',
    blocks: [
      {
        title: `Income each ${unit(w)}`,
        type: 'bar',
        data: { points, average: r2(average), low: r2(low), high: r2(high), rating, outside, judged: judgedPoints.length },
        caption,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Money in vs money out

export interface FlowPoint {
  interval: KeyInterval;
  income: number | null;
  /** The borrowed part of `income` (debt financing), drawn as its own segment. */
  borrowed: number | null;
  expense: number | null;
  net: number | null;
}

export function keyCashFlow(data: FinData, w: KeyWindow): KeyChart<{ points: FlowPoint[] }> {
  const points: FlowPoint[] = w.intervals.map((iv) => {
    if (!iv.hasData) return { interval: iv, income: null, borrowed: null, expense: null, net: null };
    const income = r2(sumIn(data, iv, 'income'));
    const borrowed = r2(income - sumIn(data, iv, 'income', true));
    const expense = r2(sumIn(data, iv, 'expense'));
    return { interval: iv, income, borrowed, expense, net: r2(income - expense) };
  });
  const withData = points.filter((p) => p.net !== null);
  const deficits = withData.filter((p) => p.net! < 0);
  const selected = [...points].reverse().find((p) => p.interval.selected && p.net !== null);
  const lastSix = withData.slice(-6);
  const status: Status = selected && selected.net! < 0 ? 'off_track' : lastSix.filter((p) => p.net! < 0).length >= 2 ? 'watch' : 'on_track';
  let caption: string;
  if (!withData.length) caption = 'No money in or out recorded in this window yet.';
  else {
    caption = `You spent less than you earned in ${withData.length - deficits.length} of ${withData.length} ${units(w)}`;
    if (deficits.length === 1) caption += `; ${nameOf(deficits[0].interval, w)} was the only deficit (−${money(-deficits[0].net!)}).`;
    else if (deficits.length > 1) {
      const worst = [...deficits].sort((a, b) => a.net! - b.net!)[0];
      caption += `; the biggest deficit was ${nameOf(worst.interval, w)} (−${money(-worst.net!)}).`;
    } else caption += '.';
  }
  return {
    status,
    summary:
      status === 'off_track'
        ? `You spent more than you earned in ${selected ? nameOf(selected.interval, w) : 'the selected period'}.`
        : status === 'watch'
          ? `Deficits in ${lastSix.filter((p) => p.net! < 0).length} of the last ${lastSix.length} ${units(w)}.`
          : 'Money in has kept ahead of money out.',
    blocks: [{ title: `Income and expenses each ${unit(w)}`, type: 'grouped-bar', data: { points }, caption }],
  };
}

// ---------------------------------------------------------------------------
// 3. Where are income and expenses heading?

export interface TrendPoint {
  interval: KeyInterval;
  income: number | null;
  expense: number | null;
}

export interface TrendData {
  points: TrendPoint[];
  incomeGrowth: number | null;
  expenseGrowth: number | null;
  /** Intervals until expenses reach income at current trends, if they will. */
  meetsIn: number | null;
}

/** Average change per interval over the last 6 complete intervals with data. */
export function monthlyGrowth(values: number[]): number | null {
  const v = values.slice(-6).filter((x) => x > 0);
  if (v.length < 3) return null;
  return (v[v.length - 1] / v[0]) ** (1 / (v.length - 1)) - 1;
}

function movingAverage(values: (number | null)[], size = 3): (number | null)[] {
  return values.map((v, i) => {
    if (v === null) return null;
    const window = values.slice(Math.max(0, i - size + 1), i + 1).filter((x): x is number => x !== null);
    return r2(window.reduce((s, x) => s + x, 0) / window.length);
  });
}

export function incomeExpenseTrend(data: FinData, w: KeyWindow, smooth = false): KeyChart<TrendData> {
  const raw = w.intervals.map((iv) => ({
    interval: iv,
    income: iv.hasData ? r2(sumIn(data, iv, 'income')) : null,
    expense: iv.hasData ? r2(sumIn(data, iv, 'expense')) : null,
  }));
  const complete = raw.filter((p) => p.income !== null && !p.interval.current);
  const incomeGrowth = monthlyGrowth(complete.map((p) => p.income!));
  const expenseGrowth = monthlyGrowth(complete.map((p) => p.expense!));
  // When would they meet? Project each from its latest complete value.
  let meetsIn: number | null = null;
  const last = complete[complete.length - 1];
  if (last && incomeGrowth !== null && expenseGrowth !== null && last.income! > 0 && last.expense! > 0) {
    const gap = last.income! - last.expense!;
    if (gap > 0 && expenseGrowth > incomeGrowth) {
      const t = Math.log(last.income! / last.expense!) / Math.log((1 + expenseGrowth) / (1 + incomeGrowth));
      if (Number.isFinite(t) && t > 0) meetsIn = Math.ceil(t);
    }
  }
  const status: Status = meetsIn !== null && meetsIn <= 3 ? 'off_track' : incomeGrowth !== null && expenseGrowth !== null && expenseGrowth > incomeGrowth ? 'watch' : 'on_track';
  const points: TrendPoint[] = smooth
    ? (() => {
        const inc = movingAverage(raw.map((p) => p.income));
        const exp = movingAverage(raw.map((p) => p.expense));
        return raw.map((p, i) => ({ interval: p.interval, income: inc[i], expense: exp[i] }));
      })()
    : raw;
  let caption: string;
  if (incomeGrowth === null || expenseGrowth === null) caption = `A few more ${units(w)} of history are needed to see a direction.`;
  else if (expenseGrowth > incomeGrowth) {
    caption = `Expenses are rising faster than income`;
    caption += meetsIn !== null ? `; at this rate they'll meet in about ${meetsIn} ${meetsIn === 1 ? unit(w) : units(w)}.` : last && last.expense! >= last.income! ? ', and already match or pass it.' : '.';
  } else caption = expenseGrowth < 0 && incomeGrowth >= 0 ? 'Income is holding up while expenses come down.' : 'Income is keeping pace with expenses.';
  return {
    status,
    summary: status === 'off_track' ? 'Expenses could overtake income within 3 months.' : status === 'watch' ? 'Expenses are growing faster than income.' : 'Income is keeping ahead of expenses.',
    blocks: [{ title: smooth ? '3-month average' : `Totals each ${unit(w)}`, type: 'area-line', data: { points, incomeGrowth, expenseGrowth, meetsIn }, caption }],
  };
}

// ---------------------------------------------------------------------------
// 4. Are my savings growing?

export interface BalancePoint {
  interval: KeyInterval;
  balance: number | null;
}

export interface ContributionPoint {
  interval: KeyInterval;
  contribution: number | null;
  metTarget: boolean | null;
}

export function savingsTrend(
  data: FinData,
  w: KeyWindow
): KeyChart<{ points: BalancePoint[] } | { points: ContributionPoint[]; target: number | null; rateThisMonth: number | null; cushionMonths: number | null }> {
  const flows = [
    ...data.txs.map((t) => ({ date: t.date, flow: t.savingsFlow })),
    ...data.transfers.map((t) => ({ date: t.date, flow: t.savingsFlow })),
  ].filter((f) => f.flow !== 0);
  const firstFlow = flows.reduce<Date | null>((min, f) => (!min || f.date < min ? f.date : min), null);
  const balances: BalancePoint[] = w.intervals.map((iv) => {
    const beforeTracking = !firstFlow || iv.end < firstFlow;
    const after = flows.filter((f) => f.date > (iv.current ? data.today : iv.end)).reduce((s, f) => s + f.flow, 0);
    return { interval: iv, balance: beforeTracking && data.balance.savings === 0 ? null : r2(data.balance.savings - after) };
  });
  // Monthly target: the savings rate target applied to average monthly income.
  const hist = historyMonths(data, 6);
  const avgIncome = hist.length ? hist.reduce((s, m) => s + monthTotal(data, m, 'income'), 0) / hist.length : 0;
  const perInterval = w.granularity === 'quarter' ? 3 : 1;
  const target = data.savingsTarget > 0 && avgIncome > 0 ? r2(data.savingsTarget * avgIncome * perInterval) : null;
  const contributions: ContributionPoint[] = w.intervals.map((iv) => {
    const inside = flows.filter((f) => inPeriod(f.date, iv));
    if (!inside.length && !iv.hasData) return { interval: iv, contribution: null, metTarget: null };
    const contribution = r2(inside.reduce((s, f) => s + f.flow, 0));
    return { interval: iv, contribution, metTarget: target !== null && !iv.current ? contribution >= target : null };
  });

  const knownBalances = balances.filter((b) => b.balance !== null);
  const growth = knownBalances.length >= 2 ? knownBalances[knownBalances.length - 1].balance! - knownBalances[0].balance! : null;
  const complete = contributions.filter((c) => c.metTarget !== null);
  const met = complete.filter((c) => c.metTarget).length;
  const withdrawals = contributions.filter((c) => (c.contribution ?? 0) < 0).map((c) => nameOf(c.interval, w));

  // Status: balance fell over the last 3 intervals → off track; missed the
  // target in 2+ of the last 3 → watch.
  const recent = knownBalances.slice(-4);
  const fell = recent.length >= 2 && recent[recent.length - 1].balance! < recent[0].balance!;
  const lastThree = complete.slice(-3);
  const status: Status = fell ? 'off_track' : lastThree.filter((c) => !c.metTarget).length >= 2 ? 'watch' : 'on_track';

  const month = monthKey(data.today);
  const incomeNow = monthTotal(data, month, 'income');
  const savedNow = flows.filter((f) => monthKey(f.date) === month).reduce((s, f) => s + f.flow, 0);
  const avgExpense = hist.length ? hist.reduce((s, m) => s + monthTotal(data, m, 'expense'), 0) / hist.length : 0;

  const spanMonths = w.intervals.length * perInterval;
  const span = spanMonths === 12 ? 'over the year' : `over these ${w.intervals.length} ${units(w)}`;
  let contributionCaption: string;
  if (!complete.length) contributionCaption = target === null ? 'Set a savings target to track contributions against it.' : 'No finished months to compare with the target yet.';
  else contributionCaption = `You met your ${money(target!)} target in ${met} of ${complete.length} ${units(w)}`;
  if (withdrawals.length) contributionCaption += `${complete.length ? ';' : ''} withdrawals in ${listNames(withdrawals)} set you back.`;
  else if (complete.length) contributionCaption += '.';

  return {
    status,
    summary: fell ? 'Your savings balance fell over the last 3 months.' : status === 'watch' ? 'Contributions missed the target in 2 of the last 3 months.' : 'Your savings are on course.',
    blocks: [
      {
        title: 'Savings balance',
        type: 'line',
        data: { points: balances },
        caption: growth === null ? 'Not enough savings history yet.' : `Savings ${growth >= 0 ? 'grew' : 'fell'} by ${money(Math.abs(growth))} ${span}.`,
      },
      {
        title: `Contributions each ${unit(w)}`,
        type: 'bar',
        data: {
          points: contributions,
          target,
          rateThisMonth: incomeNow > 0 ? savedNow / incomeNow : null,
          cushionMonths: avgExpense > 0 ? data.balance.savings / avgExpense : null,
        },
        caption: contributionCaption,
      },
    ],
  };
}

