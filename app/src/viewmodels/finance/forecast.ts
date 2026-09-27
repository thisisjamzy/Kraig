// Finance Insights — the forecast: income, expenses, planned savings and
// the gap between them for the coming months, always forward-looking from
// today. Pure.
//
// Projected income per month = the month's planned income (recurring
// income items at their amounts, plus one-off expected income items) + an
// estimate for irregular income that no item covers: the weighted average
// of the last 6 months of such income, recent months weighing more.
//
// Projected expenses per month = the month's budget plan when it has one;
// otherwise the weighted 6-month averages of fixed, variable and unplanned
// spending, plus known annual costs (a category spent in the same month
// last year and rarely otherwise).
//
// The range around each figure is ± its standard deviation over those 6
// months; with under 3 months of history the forecast is "low confidence".
// The current month shows what actually happened so far plus a projection
// for the rest of it.

import type { TxPlanSplit } from './classify';
import type { FinData } from './types';
import { monthKey, monthName, shiftMonthKey } from './ranges';
import { historyMonths, r2 } from './metrics';

export type Scenario = 'cautious' | 'expected' | 'optimistic';

export interface ForecastMonth {
  month: string;
  label: string;
  current: boolean;
  income: number;
  incomeLow: number;
  incomeHigh: number;
  /** Part of `income` that's an estimate of irregular income. */
  incomeEstimated: number;
  expense: number;
  expenseLow: number;
  expenseHigh: number;
  /** Where the expense figure comes from. */
  expenseSource: 'plan' | 'average';
  savings: number;
  gap: number;
  balance: number;
  /** Current month only: what already happened. */
  actualIncome: number;
  actualExpense: number;
  whatIfs: number;
}

export interface Forecast {
  months: ForecastMonth[];
  lowConfidence: boolean;
  historyMonths: number;
  startBalance: number;
}

export interface ForecastOptions {
  horizon: number;
  scenario: Scenario;
  includeSavings: boolean;
}

function weightedAverage(values: number[]) {
  if (!values.length) return 0;
  let total = 0;
  let weights = 0;
  values.forEach((v, i) => {
    total += v * (i + 1);
    weights += i + 1;
  });
  return total / weights;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

export function forecast(data: FinData, splits: Map<string, TxPlanSplit>, opts: ForecastOptions): Forecast {
  const current = monthKey(data.today);
  const hist = historyMonths(data, 6);
  const monthly = (m: string, pick: (t: FinData['txs'][number]) => boolean) =>
    data.txs.filter((t) => t.month === m && pick(t)).reduce((s, t) => s + t.amount, 0);

  const incomeHist = hist.map((m) => monthly(m, (t) => t.kind === 'income'));
  const irregularHist = hist.map((m) => monthly(m, (t) => t.kind === 'income' && !t.link));
  const expenseHist = hist.map((m) => monthly(m, (t) => t.kind === 'expense'));
  const fixedHist = hist.map((m) => monthly(m, (t) => t.kind === 'expense' && t.fixed));
  const unplannedHist = hist.map((m) => monthly(m, (t) => t.kind === 'expense' && !t.fixed && (splits.get(t.id)?.unplanned ?? 0) > 0));
  const variableHist = expenseHist.map((v, i) => v - fixedHist[i] - unplannedHist[i]);

  const irregular = weightedAverage(irregularHist);
  const baseline = weightedAverage(fixedHist) + weightedAverage(variableHist) + weightedAverage(unplannedHist);
  const incomeSd = stdDev(incomeHist);
  const expenseSd = stdDev(expenseHist);

  const annualFor = (m: string) => {
    // Categories spent in this month last year but in at most 2 of the
    // other 11 months before it — an annual cost that comes around again.
    const lastYear = shiftMonthKey(m, -12);
    const others = Array.from({ length: 11 }, (_, i) => shiftMonthKey(lastYear, i + 1));
    const byCategory = new Map<string, number>();
    for (const t of data.txs) if (t.kind === 'expense' && t.month === lastYear) byCategory.set(t.categoryId ?? 'none', (byCategory.get(t.categoryId ?? 'none') ?? 0) + t.amount);
    let total = 0;
    for (const [cat, amount] of byCategory) {
      const seen = others.filter((o) => data.txs.some((t) => t.kind === 'expense' && t.month === o && (t.categoryId ?? 'none') === cat)).length;
      if (seen <= 2 && amount > 0) total += amount;
    }
    return total;
  };

  const startBalance = r2(data.balance.spending + (opts.includeSavings ? data.balance.savings : 0));
  let balance = startBalance;
  const months: ForecastMonth[] = [];
  for (let i = 0; i <= opts.horizon; i++) {
    const m = shiftMonthKey(current, i);
    const plan = data.plan(m);
    const whatIfIncome = data.forecastItems.filter((x) => x.month === m && x.kind === 'income').reduce((s, x) => s + x.amount, 0);
    const whatIfExpense = data.forecastItems.filter((x) => x.month === m && x.kind === 'expense').reduce((s, x) => s + x.amount, 0);

    let income = plan.plannedIncome + irregular + whatIfIncome;
    const hasPlan = plan.plannedExpense > 0;
    let expense = (hasPlan ? plan.plannedExpense : baseline + annualFor(m)) + whatIfExpense;
    let incomeLow = income - incomeSd;
    let incomeHigh = income + incomeSd;
    let expenseLow = Math.max(0, expense - expenseSd);
    let expenseHigh = expense + expenseSd;
    if (opts.scenario === 'cautious') {
      income = incomeLow;
      expense = expenseHigh;
    } else if (opts.scenario === 'optimistic') {
      income = incomeHigh;
      expense = expenseLow;
    }
    const savings = plan.plannedSavings;

    let actualIncome = 0;
    let actualExpense = 0;
    if (i === 0) {
      actualIncome = monthly(m, (t) => t.kind === 'income');
      actualExpense = monthly(m, (t) => t.kind === 'expense');
      // Never project less than what's already happened.
      income = Math.max(income, actualIncome);
      expense = Math.max(expense, actualExpense);
      incomeLow = Math.max(incomeLow, actualIncome);
      expenseLow = Math.max(expenseLow, actualExpense);
      incomeHigh = Math.max(incomeHigh, income);
      expenseHigh = Math.max(expenseHigh, expense);
    }
    const gap = income - expense - savings;
    // Today's balance already reflects this month's money so far.
    const flow = i === 0 ? income - actualIncome - (expense - actualExpense) : income - expense;
    balance += flow - (opts.includeSavings ? 0 : savings);
    months.push({
      month: m,
      label: monthName(m, false),
      current: i === 0,
      income: r2(income),
      incomeLow: r2(Math.max(0, incomeLow)),
      incomeHigh: r2(incomeHigh),
      incomeEstimated: r2(irregular),
      expense: r2(expense),
      expenseLow: r2(expenseLow),
      expenseHigh: r2(expenseHigh),
      expenseSource: hasPlan ? 'plan' : 'average',
      savings: r2(savings),
      gap: r2(gap),
      balance: r2(balance),
      actualIncome: r2(actualIncome),
      actualExpense: r2(actualExpense),
      whatIfs: r2(whatIfIncome - whatIfExpense),
    });
  }
  return { months, lowConfidence: hist.length < 3, historyMonths: hist.length, startBalance };
}

// ---------------------------------------------------------------------------
// Guidance

export interface Guidance {
  text: string;
  action: string;
  href: string;
}

export function guidance(data: FinData, f: Forecast, currency = 'XAF'): { tips: Guidance[]; suggested: { month: string; amount: number; href: string } | null } {
  const fmt = (n: number) => `${Math.round(n).toLocaleString('en-US')} ${currency}`;
  const tips: Guidance[] = [];
  const upcoming = f.months.filter((m) => !m.current);
  const short = f.months.find((m) => m.gap < 0);
  if (short) {
    const monthsToSave = Math.max(1, f.months.indexOf(short) + 1);
    const perMonth = Math.ceil(-short.gap / monthsToSave / 1000) * 1000;
    tips.push({
      text: `${monthName(short.month)} is ${fmt(-short.gap)} short. Save ${fmt(perMonth)} a month from now to cover it.`,
      action: 'Create savings goal',
      href: '/buckets/new',
    });
  }
  const free = upcoming.reduce((s, m) => s + Math.max(0, m.gap), 0);
  if (free > 0) {
    tips.push({
      text: `You have ${fmt(free)} free over the next ${upcoming.length} ${upcoming.length === 1 ? 'month' : 'months'}.`,
      action: 'Plan in buckets',
      href: '/budget',
    });
  }
  // Variable spending rising month over month (last 3 whole months).
  const hist = historyMonths(data, 3);
  const variable = hist.map((m) => data.txs.filter((t) => t.kind === 'expense' && t.month === m && !t.fixed).reduce((s, t) => s + t.amount, 0));
  const growth: number[] = [];
  for (let i = 1; i < variable.length; i++) if (variable[i - 1] > 0) growth.push((variable[i] - variable[i - 1]) / variable[i - 1]);
  const avgGrowth = growth.length ? growth.reduce((s, g) => s + g, 0) / growth.length : 0;
  if (growth.length >= 2 && avgGrowth > 0.1) {
    tips.push({
      text: `Variable spending is rising ${Math.round(avgGrowth * 100)}% a month; if it continues, the coming months will cost more than shown.`,
      action: 'See categories',
      href: '/categories',
    });
  }
  const next = f.months.find((m) => !m.current);
  return {
    tips: tips.slice(0, 3),
    suggested: next ? { month: next.month, amount: Math.round(next.expense / 1000) * 1000, href: `/budget?month=${next.month}` } : null,
  };
}

