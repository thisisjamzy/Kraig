// The Money dashboard's figures for one period (Remix/Dashboard/
// dashboards-redesign.md, sections 8, 10 and 11): one view model per card,
// so the cards only render. Built on the finance model (FinData, the
// planned/unplanned split) plus wallets, debts and reconciliation checks.
//
// Balance = every real wallet (spending and savings). The balance at any
// moment is today's balance minus everything that changed it since: income,
// spending, transfer fees and the differences reconciliations snapped in.
// So the waterfall always closes: closing = opening + income − spending −
// transfer fees − net untracked.
//
// Untracked money comes from reconciliations: per wallet, counted minus
// recorded at the check (negative = missing, positive = found), counted in
// the period the check was done in. Pure: tested in test/dashboard.test.ts.

import {
  addUnit,
  bucketsBetween,
  historyBuckets,
  inRange,
  MON,
  MONTHS,
  startOf,
  weekdayMon,
  WEEKDAYS_MON,
  type BucketUnit,
  type DashBucket,
  type DashPeriod,
} from '../../shared/dashboard/period';
import { amount, compact, money as moneyText, percent } from '../../shared/dashboard/format';
import type { FinData, FinTx } from '../finance/types';
import type { TxPlanSplit } from '../finance/classify';
import { rangeTotals, safeToSpend } from '../finance/metrics';
import type { Kpi, PillTone } from '../../widgets/Charts/ChartCard';

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const pad = (n: number) => String(n).padStart(2, '0');
const monthKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export interface MoneyWallet {
  id: string;
  name: string;
  /** The wallet's own type label ("Cash", "Mobile Money", "Current Account"...). */
  type: string;
  balance: number;
}

export interface MoneyDebt {
  id: string;
  name: string;
  principal: number;
  outstanding: number;
  /** Monthly payment, if there's a plan. */
  monthly: number | null;
}

/** One reconciliation check: per wallet, recorded and counted (display currency). */
export interface MoneyCheck {
  at: Date;
  wallets: { id: string; recorded: number; counted: number }[];
}

export interface MoneyInput {
  data: FinData;
  splits: Map<string, TxPlanSplit>;
  currency: string;
  wallets: MoneyWallet[];
  debts: MoneyDebt[];
  checks: MoneyCheck[];
  /** The savings baskets' combined target, or null. */
  savingsGoal: number | null;
  /** Untracked rate target, 0.02 = 2%. */
  untrackedTarget: number;
}

export type WalletKind = 'bank' | 'mobile' | 'cash' | 'savings';
export function walletKind(type: string): WalletKind {
  const t = type.toLowerCase();
  if (t.includes('savings')) return 'savings';
  if (t.includes('mobile') || t.includes('wallet')) return 'mobile';
  if (t.includes('cash')) return 'cash';
  return 'bank';
}
const WALLET_KIND_LABEL: Record<WalletKind, string> = { bank: 'Bank', mobile: 'Mobile money', cash: 'Cash', savings: 'Savings' };

// ---------------------------------------------------------------------------
// Flows over any range [start, end)

type Range = { start: Date; end: Date };

export function txsIn(data: Pick<FinData, 'txs'>, r: Range): FinTx[] {
  return data.txs.filter((t) => inRange(t.date, r));
}

export function flowsIn(input: Pick<MoneyInput, 'data' | 'splits' | 'checks'>, r: Range) {
  const txs = txsIn(input.data, r);
  const earned = sum(txs.filter((t) => t.kind === 'income' && !t.borrowed), (t) => t.amount);
  const borrowed = sum(txs.filter((t) => t.kind === 'income' && t.borrowed), (t) => t.amount);
  const spent = sum(txs.filter((t) => t.kind === 'expense'), (t) => t.amount);
  const unplanned = sum(txs.filter((t) => t.kind === 'expense'), (t) => input.splits.get(t.id)?.unplanned ?? 0);
  const fees = sum(input.data.transfers.filter((t) => inRange(t.date, r)), (t) => t.charges);
  const diffs = input.checks.filter((c) => inRange(c.at, r)).flatMap((c) => c.wallets.map((w) => w.counted - w.recorded));
  const missing = sum(diffs.filter((d) => d < 0), (d) => -d);
  const found = sum(diffs.filter((d) => d > 0), (d) => d);
  return {
    earned: r2(earned),
    borrowed: r2(borrowed),
    income: r2(earned + borrowed),
    spent: r2(spent),
    unplanned: r2(unplanned),
    fees: r2(fees),
    missing: r2(missing),
    found: r2(found),
    /** Missing minus found: money that left without a record. */
    netUntracked: r2(missing - found),
  };
}

/** Every real wallet's balance at `at`: today's balance minus what changed it since. */
export function balanceAt(input: Pick<MoneyInput, 'data' | 'splits' | 'checks' | 'wallets'>, at: Date): number {
  const now = input.data.today;
  const total = sum(input.wallets, (w) => w.balance);
  if (at >= now) return r2(total);
  const f = flowsIn(input, { start: at, end: new Date(now.getTime() + 1) });
  return r2(total - (f.income - f.spent - f.fees - f.netUntracked));
}

/** Planned spending in a range: each month's plan, pro-rated by the days of it the range covers. */
export function plannedIn(data: FinData, r: Range, pick: (month: string) => number) {
  let total = 0;
  for (let m = startOf('month', r.start); m < r.end; m = addUnit('month', m, 1)) {
    const next = addUnit('month', m, 1);
    const from = Math.max(m.getTime(), r.start.getTime());
    const to = Math.min(next.getTime(), r.end.getTime());
    if (to <= from) continue;
    total += pick(monthKeyOf(m)) * ((to - from) / (next.getTime() - m.getTime()));
  }
  return r2(total);
}

// ---------------------------------------------------------------------------
// View models

export interface CardBase {
  title: string;
  subtitle?: string;
  insight?: string | null;
  /** Shown instead of the chart when there's nothing to show. */
  empty?: string | null;
}

export type MoneyCard =
  | (CardBase & { id: 'dayHours'; data: { label: string; value: number | null }[] })
  | (CardBase & { id: 'dayTx'; rows: { time: string; what: string; category: string; amount: number; unplanned: boolean; income: boolean }[] })
  | (CardBase & { id: 'incEach'; data: { label: string; value: number | null; above: boolean }[]; average: number })
  | (CardBase & { id: 'flow'; data: { label: string; earned: number; borrowed: number; spent: number; future: boolean }[] })
  | (CardBase & { id: 'trend'; labels: { text: string; future?: boolean }[]; income: (number | null)[]; spending: (number | null)[]; forecastFrom: number | null })
  | (CardBase & { id: 'sav'; labels: { text: string; future?: boolean }[]; values: (number | null)[]; goal: number | null })
  | (CardBase & { id: 'wf'; steps: { label: string; value: number; kind: 'total' | 'in' | 'out' | 'untracked' }[]; opening: number; closing: number })
  | (CardBase & { id: 'sk'; sources: { label: string; value: number; color: string }[]; uses: { label: string; value: number; color: string }[] })
  | (CardBase & { id: 'plan'; rows: { label: string; actual: number; plan: number }[] })
  | (CardBase & { id: 'box'; groups: { label: string; values: number[] }[] })
  | (CardBase & { id: 'debts'; rows: { label: string; paid: number; left: number; sub: string }[] })
  | (CardBase & { id: 'tree'; parts: { label: string; value: number; color: string }[] })
  | (CardBase & { id: 'when'; view: 'calendar'; days: { date: Date; value: number | null }[] })
  | (CardBase & { id: 'when'; view: 'matrix'; columns: string[]; rows: { label: string; cells: (number | null)[] }[] })
  | (CardBase & { id: 'fc'; labels: { text: string; future?: boolean }[]; balance: (number | null)[]; forecastFrom: number | null; table: { label: string; income: number; spending: number; balance: number }[] })
  | (CardBase & { id: 'recEach'; data: { label: string; value: number | null }[] })
  | (CardBase & { id: 'recRate'; labels: { text: string; future?: boolean }[]; values: (number | null)[]; dots: (string | null)[]; target: number })
  | (CardBase & { id: 'recWallet'; rows: { label: string; value: number; note: string }[] })
  | (CardBase & { id: 'recLatest'; rows: { name: string; when: string; due: boolean; difference: number; recorded: number; counted: number }[] })
  | (CardBase & { id: 'recLog'; rows: { date: string; wallet: string; recorded: number; counted: number; difference: number; days: number | null }[] });

export interface MoneyHero {
  label: string;
  value: string;
  sub: string;
  insight: string | null;
  segments: { label: string; value: number; color: string }[];
}

export interface MoneyDashboard {
  hero: MoneyHero;
  kpis: Kpi[];
  cards: Partial<Record<MoneyCard['id'], MoneyCard>>;
}

const P = 'var(--c-primary)';
const PD = 'var(--c-primary-dark)';
const A = 'var(--c-accent)';
const G = 'var(--c-grey)';
const PM = 'var(--c-primary-mid)';

const dayLabel = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;

/** Pill comparing a figure with the same point before. `upGood`: whether a rise is good. */
function pill(current: number, previous: number | null, upGood: boolean | null, unit: (n: number) => string = (n) => compact(n)): Kpi['pill'] {
  if (previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return { text: 'No change', tone: 'neutral', arrow: null };
  const up = diff > 0;
  const tone: PillTone = upGood === null ? 'neutral' : up === upGood ? 'good' : 'bad';
  const rel = previous !== 0 ? `${Math.round(Math.abs(diff / previous) * 100)}%` : unit(Math.abs(diff));
  return { text: `${rel} vs before`, tone, arrow: up ? 'up' : 'down' };
}

function bucketValues(buckets: DashBucket[], pick: (b: DashBucket) => number): (number | null)[] {
  return buckets.map((b) => (b.future ? null : r2(pick(b))));
}

/** The unit and history for the "each period" cards (income, untracked, rate). */
function historyFor(p: DashPeriod): DashBucket[] {
  switch (p.kind) {
    case 'day':
      return historyBuckets(p, 'day', 7);
    case 'week':
      return bucketsBetween('day', p.start, p.end, p.now);
    case 'month':
      return historyBuckets(p, 'month', 12);
    case 'quarter':
      return historyBuckets(p, 'quarter', 8);
    case 'year':
      return bucketsBetween('month', p.start, p.end, p.now);
    case 'all':
      return bucketsBetween('quarter', p.start, p.end, p.now);
  }
}

/** Money in and out buckets: days, weeks, months, months, years. */
function flowBuckets(p: DashPeriod): DashBucket[] {
  const unit: BucketUnit = { day: 'hour', week: 'day', month: 'week', quarter: 'month', year: 'month', all: 'year' }[p.kind] as BucketUnit;
  return bucketsBetween(unit, p.start, p.end, p.now);
}

function topGroups(txs: FinTx[], n: number): { label: string; value: number }[] {
  const by = new Map<string, number>();
  for (const t of txs) by.set(t.categoryName, (by.get(t.categoryName) ?? 0) + t.amount);
  const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([label, value]) => ({ label, value: r2(value) }));
  const rest = sum(sorted.slice(n), ([, v]) => v);
  return rest > 0.5 ? [...top, { label: 'Everything else', value: r2(rest) }] : top;
}

export function moneyDashboard(input: MoneyInput, p: DashPeriod, cardIds: string[]): MoneyDashboard {
  const { data, currency } = input;
  const fmt = (n: number) => moneyText(n, currency);
  const range = { start: p.start, end: p.to };
  const flows = flowsIn(input, range);
  const finP = { kind: 'custom' as const, start: p.start, end: new Date(p.to.getTime() - 1) };
  const finC = p.compare ? { kind: 'custom' as const, start: p.compare.start, end: new Date(p.compare.end.getTime() - 1) } : null;
  const totals = rangeTotals(data, finP, input.splits);
  const prev = finC ? rangeTotals(data, finC, input.splits) : null;

  // ---- Hero ----
  let hero: MoneyHero;
  if (p.kind === 'day' || p.kind === 'week' || p.kind === 'month') {
    const safe = safeToSpend(data);
    const month = monthKeyOf(data.today);
    const monthSpent = flowsIn(input, { start: startOf('month', data.today), end: new Date(data.today.getTime() + 1) }).spent;
    const plan = data.plan(month).plannedExpense;
    hero =
      p.kind === 'day'
        ? {
            label: 'Safe to spend today',
            value: fmt(safe.perDay),
            sub: `${fmt(safe.amount)} left in ${MONTHS[data.today.getMonth()]}'s plan over ${safe.daysLeft} ${safe.daysLeft === 1 ? 'day' : 'days'}.`,
            insight: flows.spent > safe.perDay + 0.5 ? `You have spent ${fmt(flows.spent)} today, more than a day's share.` : `You have spent ${fmt(flows.spent)} today.`,
            segments: [
              { label: 'Spent', value: monthSpent, color: PD },
              { label: 'Bills due', value: safe.upcoming, color: P },
              { label: 'Left', value: safe.amount, color: A },
            ],
          }
        : {
            label: `Left in ${MONTHS[data.today.getMonth()]}'s plan`,
            value: fmt(safe.amount),
            sub: plan > 0 ? `${Math.round((monthSpent / plan) * 100)}% of the ${amount(plan)} plan is used, ${safe.daysLeft} ${safe.daysLeft === 1 ? 'day' : 'days'} to go.` : 'No spending planned this month yet.',
            insight: safe.daysLeft > 0 ? `About ${fmt(safe.perDay)} a day for the rest of the month.` : null,
            segments: [
              { label: 'Spent', value: monthSpent, color: PD },
              { label: 'Bills due', value: safe.upcoming, color: P },
              { label: 'Left', value: safe.amount, color: A },
            ],
          };
  } else {
    const closing = balanceAt(input, p.to);
    const opening = balanceAt(input, p.start);
    const byKind = new Map<WalletKind, number>();
    for (const w of input.wallets) byKind.set(walletKind(w.type), (byKind.get(walletKind(w.type)) ?? 0) + w.balance);
    const colors: Record<WalletKind, string> = { bank: PD, mobile: P, cash: A, savings: PM };
    const change = closing - opening;
    hero = {
      label: `Balance on ${dayLabel(new Date(p.to.getTime() - 1))}`,
      value: fmt(closing),
      sub: p.kind === 'all' ? `Across ${input.wallets.length} wallets.` : `${change >= 0 ? 'Up' : 'Down'} ${amount(Math.abs(change))} since ${dayLabel(p.start)}.`,
      insight: null,
      segments: (['bank', 'mobile', 'cash', 'savings'] as WalletKind[])
        .filter((k) => (byKind.get(k) ?? 0) > 0.5)
        .map((k) => ({ label: WALLET_KIND_LABEL[k], value: r2(byKind.get(k) ?? 0), color: colors[k] })),
    };
  }

  // ---- KPI tiles ----
  const kpis = kpisFor(input, p, totals, prev, flows);

  // ---- Cards ----
  const cards: MoneyDashboard['cards'] = {};
  const want = new Set(cardIds);
  const flowsOf = (b: DashBucket) => flowsIn(input, { start: b.start, end: b.current ? p.now : b.end });

  if (want.has('dayHours')) {
    const hours = bucketsBetween('hour', p.start, p.end, p.now).filter((b) => b.start.getHours() >= 6 && b.start.getHours() < 22);
    const values = bucketValues(hours, (b) => flowsOf(b).spent);
    const peak = hours.reduce<{ label: string; v: number } | null>((best, b, i) => ((values[i] ?? 0) > (best?.v ?? 0) ? { label: b.label, v: values[i]! } : best), null);
    cards.dayHours = {
      id: 'dayHours',
      title: 'Spending through the day',
      subtitle: 'What you spent in each hour today',
      data: hours.map((b, i) => ({ label: b.label, value: values[i] })),
      insight: peak ? `Most of today's spending came around ${peak.label}.` : null,
      empty: flows.spent > 0 ? null : 'Nothing spent today yet. Entries you add today will show here.',
    };
  }

  if (want.has('dayTx')) {
    const txs = txsIn(data, range).filter((t) => t.kind === 'expense' || t.kind === 'income').sort((a, b) => a.date.getTime() - b.date.getTime());
    cards.dayTx = {
      id: 'dayTx',
      title: "Today's transactions",
      subtitle: `${txs.length} ${txs.length === 1 ? 'entry' : 'entries'}, oldest first`,
      rows: txs.map((t) => ({
        time: `${pad(t.date.getHours())}:${pad(t.date.getMinutes())}`,
        what: t.payee || t.categoryName,
        category: t.categoryName,
        amount: t.amount,
        unplanned: (input.splits.get(t.id)?.unplanned ?? 0) > 0.5,
        income: t.kind === 'income',
      })),
      empty: txs.length ? null : 'No entries today yet. Add one with the + button.',
    };
  }

  if (want.has('incEach')) {
    const buckets = historyFor(p);
    const values = bucketValues(buckets, (b) => flowsOf(b).income);
    const done = values.filter((v, i): v is number => v !== null && !buckets[i].current);
    const average = done.length ? r2(sum(done, (v) => v) / done.length) : 0;
    const above = done.filter((v) => v >= average).length;
    cards.incEach = {
      id: 'incEach',
      title: 'Income each period',
      subtitle: `Against your average of ${compact(average)}`,
      data: buckets.map((b, i) => ({ label: b.label, value: values[i], above: (values[i] ?? 0) >= average })),
      average,
      insight: done.length >= 2 ? `${above} of ${done.length} periods were at or above the ${compact(average)} average.` : done.length ? `Based on ${done.length} period so far.` : null,
      empty: values.some((v) => (v ?? 0) > 0) ? null : 'No income recorded yet. Record income to see it here.',
    };
  }

  if (want.has('flow')) {
    const buckets = flowBuckets(p);
    const rows = buckets.map((b) => {
      const f = b.future ? null : flowsOf(b);
      return { label: b.label, earned: f?.earned ?? 0, borrowed: f?.borrowed ?? 0, spent: f?.spent ?? 0, future: b.future };
    });
    const overs = rows.filter((r) => !r.future && r.spent > r.earned + r.borrowed + 0.5).map((r) => r.label);
    cards.flow = {
      id: 'flow',
      title: 'Money in and out',
      subtitle: 'Earned, borrowed and spent, with in minus out under each',
      data: rows,
      insight: overs.length ? `Spending was more than income in ${overs.slice(0, 4).join(', ')}${overs.length > 4 ? ' and more' : ''}.` : rows.some((r) => !r.future) ? 'Income covered spending in every period so far.' : null,
    };
  }

  if (want.has('trend') || want.has('sav')) {
    const { buckets, forecastFrom } = trendBuckets(p);
    const income = buckets.map((b) => (b.future ? plannedIn(data, b, (m) => data.plan(m).plannedIncome) : flowsOf(b).income));
    const spending = buckets.map((b) => (b.future ? plannedIn(data, b, (m) => data.plan(m).plannedExpense) : flowsOf(b).spent));
    const labels = buckets.map((b) => ({ text: b.label, future: b.future }));
    if (want.has('trend')) {
      const actualN = forecastFrom ?? buckets.length;
      const gapNow = actualN ? income[actualN - 1] - spending[actualN - 1] : 0;
      const gapThen = actualN > 6 ? income[actualN - 7] - spending[actualN - 7] : null;
      cards.trend = {
        id: 'trend',
        title: 'Where income and spending are heading',
        subtitle: forecastFrom !== null ? 'Actual so far, then your plans as a forecast' : 'Income and spending over time',
        labels,
        income,
        spending,
        forecastFrom,
        insight:
          gapThen !== null
            ? `The gap between income and spending is ${compact(gapNow)} now, against ${compact(gapThen)} six periods ago.`
            : actualN
              ? `Income was ${compact(income[actualN - 1])} and spending ${compact(spending[actualN - 1])} in the latest period.`
              : null,
      };
    }
    if (want.has('sav')) {
      const actualN = forecastFrom ?? buckets.length;
      let running = 0;
      const values = buckets.map((b, i) => {
        if (i >= actualN || b.future) return null;
        running += income[i] - spending[i];
        return r2(running);
      });
      const last = values.filter((v): v is number => v !== null).pop() ?? 0;
      const goal = p.kind === 'all' ? null : input.savingsGoal;
      cards.sav = {
        id: 'sav',
        title: 'Savings',
        subtitle: goal ? `Kept over the periods shown, against your goal of ${compact(goal)}` : 'What you kept over the periods shown',
        labels: labels.slice(0, actualN),
        values: values.slice(0, actualN),
        goal,
        insight: goal ? (last >= goal ? 'You have reached your savings goal.' : `${compact(goal - last)} left to reach your goal.`) : `${compact(last)} kept in total over these periods.`,
      };
    }
  }

  if (want.has('wf')) {
    const opening = balanceAt(input, p.start);
    const closing = balanceAt(input, p.to);
    const txs = txsIn(data, range);
    const incomeGroups = topGroups(txs.filter((t) => t.kind === 'income'), 3);
    const spendGroups = topGroups(txs.filter((t) => t.kind === 'expense'), 3);
    const steps: { label: string; value: number; kind: 'total' | 'in' | 'out' | 'untracked' }[] = [
      { label: 'Opening balance', value: opening, kind: 'total' },
      ...incomeGroups.map((g) => ({ label: g.label, value: g.value, kind: 'in' as const })),
      ...spendGroups.map((g) => ({ label: g.label, value: -g.value, kind: 'out' as const })),
    ];
    if (flows.fees > 0.5) steps.push({ label: 'Transfer fees', value: -flows.fees, kind: 'out' });
    if (Math.abs(flows.netUntracked) > 0.5) steps.push({ label: 'Untracked', value: -flows.netUntracked, kind: 'untracked' });
    steps.push({ label: 'Closing balance', value: closing, kind: 'total' });
    cards.wf = {
      id: 'wf',
      title: 'How your balance changed',
      subtitle: `${dayLabel(p.start)} to ${dayLabel(new Date(p.to.getTime() - 1))}`,
      steps,
      opening,
      closing,
      insight: `Your balance went ${closing >= opening ? 'up' : 'down'} by ${amount(Math.abs(closing - opening))}${flows.netUntracked > 0.5 ? `, ${amount(flows.netUntracked)} of it untracked` : ''}.`,
    };
  }

  if (want.has('sk')) {
    const txs = txsIn(data, range);
    const sourceColors = [P, PD, PM, G];
    const sources = topGroups(txs.filter((t) => t.kind === 'income'), 3).map((g, i) => ({ ...g, color: sourceColors[i] ?? G }));
    const debt = sum(txs.filter((t) => t.kind === 'expense' && t.debtRepayment), (t) => t.amount);
    const spendTop = topGroups(txs.filter((t) => t.kind === 'expense' && !t.debtRepayment), 3);
    const income = sum(sources, (s) => s.value);
    const out = sum(spendTop, (g) => g.value) + debt + Math.max(0, flows.netUntracked) + flows.fees;
    const kept = Math.max(0, income - out);
    const uses = [
      ...spendTop.map((g) => ({ ...g, color: A })),
      ...(flows.fees > 0.5 ? [{ label: 'Transfer fees', value: flows.fees, color: A }] : []),
      ...(debt > 0.5 ? [{ label: 'Debt', value: r2(debt), color: PD }] : []),
      ...(flows.netUntracked > 0.5 ? [{ label: 'Untracked', value: flows.netUntracked, color: G }] : []),
      ...(kept > 0.5 ? [{ label: 'Kept', value: r2(kept), color: P }] : []),
    ];
    cards.sk = {
      id: 'sk',
      title: 'Where the income went',
      subtitle: 'Income shared out over what it paid for, in proportion',
      sources,
      uses,
      insight: income > 0 ? `You kept ${percent(kept / income, 0)} of your income.` : null,
      empty: income > 0 ? null : 'No income in this period yet.',
    };
  }

  if (want.has('plan')) {
    const txs = txsIn(data, range).filter((t) => t.kind === 'expense' && t.link);
    const byBasket = new Map<string, { label: string; plan: number; actual: number }>();
    for (let m = startOf('month', p.start); m < p.to; m = addUnit('month', m, 1)) {
      const next = addUnit('month', m, 1);
      const share = (Math.min(next.getTime(), p.to.getTime()) - Math.max(m.getTime(), p.start.getTime())) / (next.getTime() - m.getTime());
      for (const item of data.plan(monthKeyOf(m)).items) {
        if (item.type !== 'Expense') continue;
        const row = byBasket.get(item.bucketId) ?? { label: item.bucketName, plan: 0, actual: 0 };
        row.plan += item.available * share;
        byBasket.set(item.bucketId, row);
      }
    }
    for (const t of txs) {
      const row = byBasket.get(t.link!.bucketId);
      if (row) row.actual += t.amount;
    }
    const rows = [...byBasket.values()].filter((r) => r.plan > 0.5 || r.actual > 0.5).sort((a, b) => b.plan - a.plan).slice(0, 6).map((r) => ({ label: r.label, plan: r2(r.plan), actual: r2(r.actual) }));
    const over = rows.filter((r) => r.actual > r.plan + 0.5).length;
    cards.plan = {
      id: 'plan',
      title: 'Planned against actual',
      subtitle: p.inProgress ? 'Each basket, with its plan to date' : 'Each basket against its plan',
      rows,
      insight: rows.length ? (over ? `${over} of ${rows.length} baskets went over plan.` : 'Every basket is within its plan.') : null,
      empty: rows.length ? null : 'No baskets planned for this period. Plan a basket to compare.',
    };
  }

  if (want.has('box')) {
    const byYear = new Map<number, number[]>();
    for (let m = startOf('month', p.start); m < p.to; m = addUnit('month', m, 1)) {
      const isCurrent = m <= p.now && p.now < addUnit('month', m, 1);
      if (isCurrent) continue;
      const v = flowsIn(input, { start: m, end: addUnit('month', m, 1) }).spent;
      byYear.set(m.getFullYear(), [...(byYear.get(m.getFullYear()) ?? []), v]);
    }
    const groups = [...byYear.entries()].map(([y, values]) => ({ label: String(y), values }));
    cards.box = {
      id: 'box',
      title: 'How much you spend in a month',
      subtitle: 'Monthly spending, summarised for each year',
      groups,
      insight: groups.length ? `Based on ${sum(groups, (g) => g.values.length)} complete months.` : null,
      empty: groups.length ? null : 'Not enough complete months yet.',
    };
  }

  if (want.has('debts')) {
    const rows = input.debts
      .filter((d) => d.outstanding > 0.5 || p.kind === 'all')
      .map((d) => {
        const paid = Math.max(0, d.principal - d.outstanding);
        const months = d.monthly && d.monthly > 0 ? Math.ceil(d.outstanding / d.monthly) : null;
        const clear = months !== null ? addUnit('month', data.today, months) : null;
        return {
          label: d.name,
          paid: r2(paid),
          left: r2(d.outstanding),
          sub: d.outstanding <= 0.5 ? 'Cleared' : d.monthly ? `${amount(d.monthly)} a month${clear ? `, clear by ${MON[clear.getMonth()]} ${clear.getFullYear()}` : ''}` : 'No payment plan',
        };
      });
    cards.debts = {
      id: 'debts',
      title: 'Debts',
      subtitle: 'Paid and left on each debt',
      rows,
      insight: rows.length ? `${compact(sum(rows, (r) => r.left))} left to repay across ${rows.length} ${rows.length === 1 ? 'debt' : 'debts'}.` : null,
      empty: rows.length ? null : 'No debts. Nicely done.',
    };
  }

  const unplannedTxs = txsIn(data, range).filter((t) => t.kind === 'expense' && (input.splits.get(t.id)?.unplanned ?? 0) > 0);
  const unplannedOf = (t: FinTx) => input.splits.get(t.id)?.unplanned ?? 0;

  if (want.has('tree')) {
    const by = new Map<string, number>();
    for (const t of unplannedTxs) by.set(t.categoryName, (by.get(t.categoryName) ?? 0) + unplannedOf(t));
    const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const fills = [PD, P, PM, A, G];
    const parts = sorted.map(([label, value], i) => ({ label, value: r2(value), color: fills[i] ?? G }));
    cards.tree = {
      id: 'tree',
      title: 'What unplanned spending went on',
      subtitle: `${compact(flows.unplanned)} of spending no basket planned`,
      parts,
      insight: parts.length ? `${parts[0].label} was the biggest unplanned cost, at ${percent(parts[0].value / Math.max(1, flows.unplanned), 0)}.` : null,
      empty: parts.length ? null : 'No unplanned spending in this period.',
    };
  }

  if (want.has('when')) {
    const dayTotal = (start: Date) => sum(unplannedTxs.filter((t) => inRange(t.date, { start, end: addUnit('day', start, 1) })), unplannedOf);
    if (p.kind === 'week' || p.kind === 'month') {
      const days = bucketsBetween('day', p.start, p.end, p.now).map((b) => ({ date: b.start, value: b.future ? null : r2(dayTotal(b.start)) }));
      const weekend = sum(days.filter((d) => weekdayMon(d.date) >= 5), (d) => d.value ?? 0);
      const all = sum(days, (d) => d.value ?? 0);
      cards.when = {
        id: 'when',
        view: 'calendar',
        title: 'Which days unplanned spending happens',
        subtitle: 'Unplanned spending on each day',
        days,
        insight: all > 0 ? (weekend / all >= 0.6 ? 'Most unplanned spending happens at weekends.' : (all - weekend) / all >= 0.6 ? 'Most unplanned spending happens on weekdays.' : 'Unplanned spending is spread across the week.') : null,
        empty: all > 0 ? null : 'No unplanned spending in this period.',
      };
    } else {
      const rowUnit: BucketUnit = p.kind === 'all' ? 'year' : 'month';
      const rowBuckets = bucketsBetween(rowUnit, p.start, p.end, p.now);
      const rows = rowBuckets.map((b) => {
        const cells: (number | null)[] = WEEKDAYS_MON.map(() => (b.future ? null : 0));
        if (!b.future) for (const t of unplannedTxs.filter((t) => inRange(t.date, b))) cells[weekdayMon(t.date)] = r2((cells[weekdayMon(t.date)] ?? 0) + unplannedOf(t));
        return { label: b.label, cells };
      });
      const byDay = WEEKDAYS_MON.map((_, i) => sum(rows, (r) => r.cells[i] ?? 0));
      const total = sum(byDay, (v) => v);
      const weekend = byDay[5] + byDay[6];
      cards.when = {
        id: 'when',
        view: 'matrix',
        title: 'When unplanned spending happens',
        subtitle: `By ${rowUnit} and day of the week`,
        columns: WEEKDAYS_MON,
        rows,
        insight: total > 0 ? (weekend / total >= 0.6 ? 'Most unplanned spending happens at weekends.' : (total - weekend) / total >= 0.6 ? 'Most unplanned spending happens on weekdays.' : 'Unplanned spending is spread across the week.') : null,
        empty: total > 0 ? null : 'No unplanned spending in this period.',
      };
    }
  }

  if (want.has('fc')) {
    const unit: BucketUnit = p.kind === 'quarter' ? 'quarter' : 'month';
    const count = p.kind === 'month' ? 6 : p.kind === 'quarter' ? 4 : 0;
    const startFc = addUnit(unit, startOf(unit, data.today), 1);
    const endFc = p.kind === 'year' ? addUnit('year', startOf('year', data.today), 1) : addUnit(unit, startFc, count);
    const future = bucketsBetween(unit, startFc, endFc, new Date(0));
    let balance = balanceAt(input, data.today);
    const table = future.map((b) => {
      const income = plannedIn(data, b, (m) => data.plan(m).plannedIncome);
      const spending = plannedIn(data, b, (m) => data.plan(m).plannedExpense);
      balance = r2(balance + income - spending);
      return { label: b.long, income, spending, balance };
    });
    const now = balanceAt(input, data.today);
    const low = table.reduce<(typeof table)[number] | null>((m, r) => (!m || r.balance < m.balance ? r : m), null);
    cards.fc = {
      id: 'fc',
      title: 'Your position ahead',
      subtitle: 'Projected balance if planned income and spending happen as expected',
      labels: [{ text: 'Now' }, ...future.map((b) => ({ text: b.label, future: true }))],
      balance: [now, ...table.map((r) => r.balance)],
      forecastFrom: 1,
      table,
      insight: low ? (low.balance < 0 ? `Your balance would go below zero in ${low.label}.` : `Your lowest point would be ${compact(low.balance)} in ${low.label}.`) : null,
      empty: table.length ? null : 'Nothing planned ahead yet.',
    };
  }

  // ---- Untracked money ----
  const missingByWallet = new Map<string, number>();
  const walletName = (id: string) => input.wallets.find((w) => w.id === id)?.name ?? 'A wallet';

  if (want.has('recEach') || want.has('recRate')) {
    const buckets = historyFor(p);
    const f = buckets.map((b) => (b.future ? null : flowsOf(b)));
    const labels = buckets.map((b) => ({ text: b.label, future: b.future }));
    if (want.has('recEach')) {
      const values = f.map((x) => (x ? r2(x.found - x.missing) : null));
      const lastIdx = values.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
      const earlier = lastIdx >= 3 ? values[lastIdx - 3] : null;
      cards.recEach = {
        id: 'recEach',
        title: 'Untracked money each period',
        subtitle: 'From your reconciliations: missing below zero, found above',
        data: buckets.map((b, i) => ({ label: b.label, value: values[i] })),
        insight:
          lastIdx >= 0
            ? `${compact(sum(f, (x) => x?.missing ?? 0))} went missing and ${compact(sum(f, (x) => x?.found ?? 0))} was found over these periods${earlier !== null ? `; the latest period was ${compact(Math.abs(values[lastIdx]!))} against ${compact(Math.abs(earlier))} three periods earlier` : ''}.`
            : null,
        empty: input.checks.length ? null : 'No reconciliations yet. Count your wallets to see untracked money here.',
      };
    }
    if (want.has('recRate')) {
      const target = input.untrackedTarget * 100;
      const values = f.map((x) => (x && x.spent > 0 ? r2((x.missing / x.spent) * 100) : x ? 0 : null));
      const within = values.filter((v) => v !== null && v <= target).length;
      const shown = values.filter((v) => v !== null).length;
      cards.recRate = {
        id: 'recRate',
        title: 'Untracked as a share of spending',
        subtitle: `Target: ${target}% or less`,
        labels,
        values,
        dots: values.map((v) => (v === null ? null : v > target ? A : P)),
        target,
        insight: shown ? `${within} of ${shown} periods were at or under the ${target}% target.` : null,
        empty: input.checks.length ? null : 'No reconciliations yet.',
      };
    }
  }

  if (want.has('recWallet')) {
    for (const c of input.checks.filter((c) => inRange(c.at, range)))
      for (const w of c.wallets) if (w.counted < w.recorded) missingByWallet.set(w.id, (missingByWallet.get(w.id) ?? 0) + (w.recorded - w.counted));
    const total = sum([...missingByWallet.values()], (v) => v);
    const rows = [...missingByWallet.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, v]) => ({ label: walletName(id), value: r2(v), note: percent(v / Math.max(1, total), 0) }));
    cards.recWallet = {
      id: 'recWallet',
      title: 'Which wallet loses track',
      subtitle: 'Money missing at reconciliation, by wallet',
      rows,
      insight: rows.length ? `${rows[0].label} accounts for ${rows[0].note} of untracked money.` : null,
      empty: rows.length ? null : 'No money went missing in this period.',
    };
  }

  if (want.has('recLatest')) {
    const sorted = [...input.checks].filter((c) => c.at <= data.today).sort((a, b) => b.at.getTime() - a.at.getTime());
    const rows = input.wallets.map((w) => {
      const check = sorted.find((c) => c.wallets.some((x) => x.id === w.id));
      const entry = check?.wallets.find((x) => x.id === w.id);
      const days = check ? Math.floor((data.today.getTime() - check.at.getTime()) / 86_400_000) : null;
      const dueAfter = walletKind(w.type) === 'bank' || walletKind(w.type) === 'savings' ? 31 : 7;
      return {
        name: w.name,
        when: days === null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`,
        due: days === null || days >= dueAfter,
        difference: entry ? r2(entry.counted - entry.recorded) : 0,
        recorded: entry?.recorded ?? w.balance,
        counted: entry?.counted ?? w.balance,
      };
    });
    rows.sort((a, b) => Number(b.due) - Number(a.due));
    const due = rows.filter((r) => r.due).length;
    cards.recLatest = {
      id: 'recLatest',
      title: 'Latest reconciliation',
      subtitle: 'What your records say against what you counted, per wallet',
      rows,
      insight: due ? `${due} ${due === 1 ? 'wallet is' : 'wallets are'} due for a check.` : 'Every wallet was checked recently.',
    };
  }

  if (want.has('recLog')) {
    const all = [...input.checks].sort((a, b) => a.at.getTime() - b.at.getTime());
    const rows: { date: string; wallet: string; recorded: number; counted: number; difference: number; days: number | null }[] = [];
    all.forEach((c, i) => {
      if (!inRange(c.at, range)) return;
      for (const w of c.wallets) {
        const before = [...all.slice(0, i)].reverse().find((x) => x.wallets.some((y) => y.id === w.id));
        rows.push({
          date: dayLabel(c.at),
          wallet: walletName(w.id),
          recorded: w.recorded,
          counted: w.counted,
          difference: r2(w.counted - w.recorded),
          days: before ? Math.round((c.at.getTime() - before.at.getTime()) / 86_400_000) : null,
        });
      }
    });
    cards.recLog = {
      id: 'recLog',
      title: 'Reconciliation log',
      subtitle: 'Every check in this period, oldest first',
      rows,
      empty: rows.length ? null : 'No checks in this period.',
    };
  }

  return { hero, kpis, cards };
}

/** Trend buckets: history then planned forecast (Month 12 + 3, Quarter 8 + 2, Year Jan to Dec, All time quarters). */
function trendBuckets(p: DashPeriod): { buckets: DashBucket[]; forecastFrom: number | null } {
  if (p.kind === 'all') return { buckets: bucketsBetween('quarter', p.start, p.end, p.now), forecastFrom: null };
  if (p.kind === 'year') {
    const buckets = bucketsBetween('month', p.start, p.end, p.now);
    const idx = buckets.findIndex((b) => b.future);
    return { buckets, forecastFrom: idx >= 0 ? idx : null };
  }
  const unit: BucketUnit = p.kind === 'quarter' ? 'quarter' : p.kind === 'month' ? 'month' : 'day';
  const history = historyBuckets(p, unit, p.kind === 'quarter' ? 8 : p.kind === 'month' ? 12 : 7);
  if (!p.inProgress || (p.kind !== 'month' && p.kind !== 'quarter')) return { buckets: history, forecastFrom: null };
  const ahead = bucketsBetween(unit, history[history.length - 1].end, addUnit(unit, history[history.length - 1].end, p.kind === 'quarter' ? 2 : 3), p.now).map((b) => ({ ...b, future: true }));
  return { buckets: [...history, ...ahead], forecastFrom: history.length };
}

function kpisFor(input: MoneyInput, p: DashPeriod, totals: ReturnType<typeof rangeTotals>, prev: ReturnType<typeof rangeTotals> | null, flows: ReturnType<typeof flowsIn>): Kpi[] {
  const { data } = input;
  const c = (n: number) => amount(n);
  if (p.kind === 'day') {
    // Compared with your average day this month so far.
    const monthStart = startOf('month', p.start);
    const daysBefore = Math.max(1, Math.round((p.start.getTime() - monthStart.getTime()) / 86_400_000));
    const monthBefore = flowsIn(input, { start: monthStart, end: p.start });
    const avgSpent = p.start > monthStart ? monthBefore.spent / daysBefore : null;
    const txs = txsIn(data, { start: p.start, end: p.to });
    const biggest = txs.filter((t) => t.kind === 'expense').sort((a, b) => b.amount - a.amount)[0];
    const daily = safeToSpend(data).perDay;
    return [
      { label: 'Spent today', value: c(flows.spent), pill: avgSpent !== null ? pill(flows.spent, avgSpent, false) : null, sub: avgSpent !== null ? `Your average day: ${c(avgSpent)}` : undefined },
      { label: 'Income today', value: c(flows.income), pill: null, sub: flows.income ? undefined : 'No income recorded today' },
      { label: 'Unplanned today', value: c(flows.unplanned), pill: null, sub: flows.spent ? `${percent(flows.unplanned / flows.spent, 0)} of today's spending` : undefined },
      { label: 'Entries today', value: String(txs.length), pill: null, sub: txs.length ? `Last at ${pad(txs[txs.length - 1].date.getHours())}:${pad(txs[txs.length - 1].date.getMinutes())}` : undefined },
      { label: 'Biggest expense', value: biggest ? c(biggest.amount) : '0', pill: null, sub: biggest ? biggest.payee || biggest.categoryName : 'Nothing spent yet' },
      { label: 'Daily budget left', value: c(Math.max(0, daily - flows.spent)), pill: { text: flows.spent <= daily ? 'Within budget' : 'Over budget', tone: flows.spent <= daily ? 'good' : 'bad' }, bar: daily > 0 ? Math.max(0, 1 - flows.spent / daily) : null },
    ];
  }
  if (p.kind === 'week') {
    const days = Math.max(1, Math.ceil((p.to.getTime() - p.start.getTime()) / 86_400_000));
    return [
      { label: 'Spent so far', value: c(totals.expense), pill: pill(totals.expense, prev?.expense ?? null, false) },
      { label: 'Income so far', value: c(totals.income), pill: pill(totals.income, prev?.income ?? null, true) },
      { label: 'Net so far', value: c(totals.net), pill: pill(totals.net, prev?.net ?? null, true) },
      { label: 'Unplanned', value: c(totals.unplanned), pill: pill(totals.unplanned, prev?.unplanned ?? null, false), sub: totals.unplannedShare !== null ? `${percent(totals.unplannedShare, 0)} of spending` : undefined },
      { label: 'Average day', value: c(totals.expense / days), pill: null, sub: `Over ${days} ${days === 1 ? 'day' : 'days'}` },
      { label: 'Baskets on track', value: totals.itemsTotal ? `${totals.itemsWithin} of ${totals.itemsTotal}` : '0', pill: null, bar: totals.adherence },
    ];
  }
  if (p.kind === 'all') {
    const months = new Map<string, number>();
    for (const t of data.txs) if (t.kind === 'income' || t.kind === 'expense') months.set(monthKeyOf(t.date), (months.get(monthKeyOf(t.date)) ?? 0) + (t.kind === 'income' ? t.amount : -t.amount));
    const best = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
    const repaid = sum(data.txs.filter((t) => t.kind === 'expense' && t.debtRepayment), (t) => t.amount);
    const n = Math.max(1, months.size);
    const neutral = (text: string): Kpi['pill'] => ({ text, tone: 'neutral', arrow: null });
    return [
      { label: 'Total earned', value: c(totals.income), pill: neutral(`${months.size} months`) },
      { label: 'Total spent', value: c(totals.expense), pill: null },
      { label: 'Kept', value: c(totals.net), pill: null, sub: totals.income ? `${percent(totals.net / totals.income, 0)} of income` : undefined },
      { label: 'Best month', value: best ? c(best[1]) : '0', pill: null, sub: best ? `${MONTHS[Number(best[0].slice(5)) - 1]} ${best[0].slice(0, 4)}` : undefined },
      { label: 'Debt repaid', value: c(repaid), pill: null },
      { label: 'Average month', value: c(totals.net / n), pill: null, sub: 'Kept each month' },
    ];
  }
  return [
    { label: 'Income', value: c(totals.income), pill: pill(totals.income, prev?.income ?? null, true), sub: totals.projectedIncome ? `${percent(totals.income / Math.max(1, totals.projectedIncome), 0)} of ${compact(totals.projectedIncome)} expected` : undefined },
    { label: 'Spending', value: c(totals.expense), pill: pill(totals.expense, prev?.expense ?? null, false), bar: totals.plannedExpense ? totals.expense / totals.plannedExpense : null, sub: totals.plannedExpense ? `${percent(totals.expense / totals.plannedExpense, 0)} of the ${compact(totals.plannedExpense)} plan` : undefined },
    { label: 'Net cash flow', value: c(totals.net), pill: pill(totals.net, prev?.net ?? null, true) },
    { label: 'Savings rate', value: totals.savingsRate === null ? '0%' : percent(totals.savingsRate), pill: pill((totals.savingsRate ?? 0) * 100, prev?.savingsRate === null || !prev ? null : prev.savingsRate * 100, true, (n) => `${n.toFixed(1)} pts`) },
    { label: 'Unplanned', value: c(totals.unplanned), pill: pill(totals.unplanned, prev?.unplanned ?? null, false), sub: totals.unplannedShare !== null ? `${percent(totals.unplannedShare, 0)} of spending` : undefined },
    { label: 'Plan adherence', value: totals.adherence === null ? '0%' : percent(totals.adherence, 0), pill: null, bar: totals.adherence, sub: totals.itemsTotal ? `${totals.itemsWithin} of ${totals.itemsTotal} items within plan` : undefined },
  ];
}
