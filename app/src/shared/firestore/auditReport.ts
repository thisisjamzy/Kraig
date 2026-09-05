'use client';

// Financial audit report — PRD Files/dreda_audit_implementation_guide.html.
// Generated on demand (never automatically) for a Month/Quarter/Year the
// household picks, stored as one immutable snapshot document under
// users/{uid}/auditReports/{id} (see refs.ts's auditReportsRef/
// auditReportRef) so it can be reopened later without recomputing, and so a
// report reflects the numbers as they stood the moment it was generated
// even if the underlying ledger keeps changing. Generating again for the
// same period creates a NEW document rather than overwriting — the
// household explicitly asked to always be able to "choose to generate new
// reports" rather than mutate history.
//
// Two things this can't do with the data this app actually stores, called
// out here rather than silently faked:
//   - The Balance Sheet's asset/liability figures are each account's/debt's
//     CURRENT currentBalance (a live snapshot), not a true point-in-time
//     balance as of the period's end — this app has no historical daily
//     balance ledger to reconstruct that from. A report generated for a
//     past period still describes today's balances, not that period's.
//   - The guide's "Subscription Creep" sub-check ("unused in 60 days") has
//     no backing data (no per-transaction usage/last-used tracking) and is
//     left out rather than invented; the "bloated"/"new subscription"
//     checks that only need spend amounts are still implemented.
// The guide's "Top merchants" has no merchant field to group by in this
// data model — Spending Habits shows top CATEGORIES by period spend
// instead (see topCategories below), the closest equivalent this app
// actually tracks.

import { getDoc, getDocs, query, where, orderBy, Timestamp, setDoc, deleteDoc, type DocumentData } from 'firebase/firestore';
import {
  accountsRef,
  debtsRef,
  categoriesRef,
  budgetRulesRef,
  goalsRef,
  settingsRef,
  exchangeRatesRef,
  statsMonthlyRef,
  statsBudgetProgressRef,
  transactionsRef,
  auditReportsRef,
  auditReportRef,
} from './refs';
import { buildCurrencyContext, toDisplay, round2, type CurrencyContext } from './currency';
import type {
  FirestoreAccount,
  FirestoreDebt,
  FirestoreCategory,
  FirestoreBudgetRule,
  FirestoreGoal,
  FirestoreTransaction,
  FirestoreDebtRecurringPlan,
  StatsMonthly,
  StatsBudgetProgress,
} from './types';

// ---------------------------------------------------------------------------
// Public types — the full shape of one generated report.
// ---------------------------------------------------------------------------

export type AuditPeriodType = 'Month' | 'Quarter' | 'Year';

/** What the household picks on the "Generate a report" screen. */
export interface AuditReportSelection {
  period: AuditPeriodType;
  year: number;
  // 0-based month (0-11) for 'Month', 0-based quarter (0-3) for 'Quarter'; ignored for 'Year'.
  index: number;
}

export type Status = 'green' | 'yellow' | 'red';
export type Trend = 'up' | 'down' | 'flat';

export interface StatCard {
  key: string;
  label: string;
  value: number;
  isPercent: boolean;
  trend: Trend;
  status: Status;
  subtitle: string;
}

export interface RedFlag {
  id: string;
  title: string;
  message: string;
}

export interface MonthPoint {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

export interface ExecutiveSummary {
  statCards: StatCard[];
  redFlags: RedFlag[];
  netWorthSparkline: { label: string; value: number }[];
  netWorthSparklineNote: string;
  goalsStatus: { total: number; completed: number; totalTarget: number; totalSaved: number };
  debtStatus: { totalDebt: number; debtCount: number; monthsToPayoffAvg: number | null };
}

export interface BalanceSheetRow {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
}

export interface BalanceSheet {
  asOfNote: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  composition: { name: string; value: number; percent: number }[];
  debtPayoffOpportunity: string | null;
}

export interface CategoryAmount {
  categoryId: string;
  name: string;
  amount: number;
  percent: number;
}

export interface WastefulAlert {
  category: string;
  percent: number;
  status: Status;
  message: string;
}

export interface CashFlow {
  periodIncome: number;
  periodExpense: number;
  periodNet: number;
  periodSavingsRate: number;
  trend: MonthPoint[];
  incomeBreakdown: CategoryAmount[];
  expenseBreakdown: CategoryAmount[];
  wastefulAlerts: WastefulAlert[];
}

export interface CategoryVolatility {
  categoryId: string;
  name: string;
  avg: number;
  stdDev: number;
  cv: number;
  status: Status;
  issue: string | null;
}

export interface TopCategoryRow {
  categoryId: string;
  name: string;
  total: number;
  count: number;
}

export interface SpendingHabits {
  categoryTrends: { categoryId: string; name: string; months: number[] }[];
  monthlyBreakdown: MonthPoint[];
  volatility: CategoryVolatility[];
  topCategories: TopCategoryRow[];
  recurringVsVariable: { recurring: number; variable: number };
  notes: string[];
}

export interface BudgetVarianceRow {
  ruleId: string;
  categoryId: string;
  name: string;
  budgeted: number;
  actual: number;
  variancePercent: number;
  status: Status;
  annualImpact: number;
}

export interface ChronicOverage {
  ruleId: string;
  name: string;
  months: string[];
}

export interface BudgetAdherence {
  rows: BudgetVarianceRow[];
  consistencyScore: number;
  chronicOverages: ChronicOverage[];
}

export interface HealthMetric {
  key: string;
  label: string;
  value: number;
  isPercent: boolean;
  status: Status;
  statusLabel: string;
}

export interface FinancialHealth {
  metrics: HealthMetric[];
  overallStatus: Status;
  overallSummary: string;
  incomeLossContingency: string;
  rankedByUrgency: { label: string; status: Status; note: string }[];
}

export interface GoalRow {
  goalId: string;
  name: string;
  totalAmount: number;
  amountCompleted: number;
  percent: number;
  deadline: string | null;
}

export interface DebtRow {
  debtId: string;
  name: string;
  principalAmount: number;
  currentBalance: number;
  totalRepaid: number;
  monthsToPayoff: number | null;
  priority: string;
}

export interface GoalsDebtSummary {
  goals: GoalRow[];
  debts: DebtRow[];
  payoffOpportunity: string | null;
}

export interface AppendixTransaction {
  id: string;
  date: string;
  description: string;
  account: string;
  category: string;
  type: string;
  amount: number;
}

export interface Appendix {
  transactions: AppendixTransaction[];
  truncatedCount: number;
  totalsByCategory: { categoryId: string; name: string; total: number; count: number }[];
}

export interface AuditReportMeta {
  period: AuditPeriodType;
  periodKey: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  currency: string;
}

export interface AuditReportData {
  meta: AuditReportMeta;
  executiveSummary: ExecutiveSummary;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlow;
  spendingHabits: SpendingHabits;
  budgetAdherence: BudgetAdherence;
  financialHealth: FinancialHealth;
  goalsDebt: GoalsDebtSummary;
  appendix: Appendix;
}

export interface FirestoreAuditReport {
  id: string;
  period: AuditPeriodType;
  periodKey: string;
  periodLabel: string;
  generatedAt: Timestamp;
  data: AuditReportData;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthKeyOf(year: number, month0: number): string {
  return `${year}-${pad2(month0 + 1)}`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

// Normalizes a debt's recurring payment plan to a monthly-equivalent amount
// — MONTHS_TO_PAYOFF and DEBT_PAYMENT_RATIO both need "monthly repayment",
// but a plan can be weekly/biweekly/yearly. 4.345 = 52/12 weeks per month,
// 2.1725 = half that for biweekly.
function monthlyEquivalent(plan: FirestoreDebtRecurringPlan): number {
  switch (plan.interval) {
    case 'weekly':
      return plan.amount * 4.345;
    case 'biweekly':
      return plan.amount * 2.1725;
    case 'yearly':
      return plan.amount / 12;
    default:
      return plan.amount;
  }
}

function monthsToPayoff(debt: FirestoreDebt): number | null {
  if (debt.paymentPlan.type !== 'recurring' || !debt.paymentPlan.recurring?.isActive) return null;
  const monthly = monthlyEquivalent(debt.paymentPlan.recurring);
  if (monthly <= 0) return null;
  return round2(debt.currentBalance / monthly);
}

// Category-name keyword heuristic for the guide's "Dining/Entertainment"
// and "Shopping" wasteful-spending checks — this app's categories are
// free-text, household-chosen names (see FirestoreCategory), not a fixed
// taxonomy Firestore could group by directly, so matching against the
// preset names src/viewmodels/categories.ts already ships (Dining Out,
// Entertainment, Shopping, Subscriptions) plus their obvious synonyms is
// the closest real signal available without asking the household to tag
// categories specially just for this report.
const DINING_ENTERTAINMENT_KEYWORDS = ['dining', 'restaurant', 'food', 'entertainment', 'movie', 'streaming'];
const SHOPPING_KEYWORDS = ['shopping', 'clothes', 'clothing', 'retail'];
const SUBSCRIPTION_KEYWORDS = ['subscription', 'subscriptions'];

function matchesKeyword(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function periodBounds(selection: AuditReportSelection): {
  start: Date;
  end: Date;
  monthsInPeriod: number;
  periodKey: string;
  periodLabel: string;
} {
  const { period, year, index } = selection;
  if (period === 'Month') {
    const start = new Date(year, index, 1);
    const end = new Date(year, index + 1, 0);
    return {
      start,
      end,
      monthsInPeriod: 1,
      periodKey: monthKeyOf(year, index),
      periodLabel: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }
  if (period === 'Quarter') {
    const startMonth = index * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return { start, end, monthsInPeriod: 3, periodKey: `${year}-Q${index + 1}`, periodLabel: `Q${index + 1} ${year}` };
  }
  const start = new Date(year, 0, 1);
  const end = new Date(year, 12, 0);
  return { start, end, monthsInPeriod: 12, periodKey: `${year}`, periodLabel: `${year}` };
}

// The 12 calendar months ending at (and including) the period's own last
// month — every trailing-window formula in the guide (MEAN/STD_DEV,
// MONTHS_OF_EXPENSES, CONSISTENCY_SCORE, chronic-overage streaks) reads off
// this same window, anchored to the period so a report generated later for
// the same period always reproduces the same trailing window.
function trailingMonths(end: Date, count: number): { key: string; label: string; year: number; month: number }[] {
  const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
  const out: { key: string; label: string; year: number; month: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    out.push({
      key: monthKeyOf(d.getFullYear(), d.getMonth()),
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateAuditReport(uid: string, selection: AuditReportSelection): Promise<AuditReportData> {
  const { start, end, monthsInPeriod, periodKey, periodLabel } = periodBounds(selection);
  const trailing12 = trailingMonths(end, 12);
  const periodMonthKeys = new Set(trailing12.slice(12 - monthsInPeriod).map((m) => m.key));

  const [
    accountsSnap,
    debtsSnap,
    categoriesSnap,
    budgetRulesSnap,
    goalsSnap,
    settingsSnap,
    ratesSnap,
    statsMonthlySnaps,
    statsBudgetSnaps,
    periodTxSnap,
  ] = await Promise.all([
    getDocs(accountsRef(uid)),
    getDocs(debtsRef(uid)),
    getDocs(categoriesRef(uid)),
    getDocs(budgetRulesRef(uid)),
    getDocs(goalsRef(uid)),
    getDoc(settingsRef(uid)),
    getDocs(exchangeRatesRef(uid)),
    Promise.all(trailing12.map((m) => getDoc(statsMonthlyRef(uid, m.key)))),
    Promise.all(trailing12.map((m) => getDoc(statsBudgetProgressRef(uid, m.key)))),
    getDocs(
      query(
        transactionsRef(uid),
        where('date', '>=', Timestamp.fromDate(start)),
        where('date', '<', Timestamp.fromDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1))),
        orderBy('date', 'asc')
      )
    ),
  ]);

  const settings = settingsSnap.data();
  const ctx: CurrencyContext = buildCurrencyContext(
    ratesSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
    settings?.defaultCurrency || 'XAF',
    settings?.displayCurrency || settings?.defaultCurrency || 'XAF'
  );

  const accounts = accountsSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreAccount).filter((a) => !a.archived);
  const debts = debtsSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreDebt).filter((d) => !d.archivedAt);
  const categories = categoriesSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreCategory);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const budgetRules = budgetRulesSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreBudgetRule).filter((r) => !r.archived);
  const goals = goalsSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreGoal).filter((g) => !g.archived);

  const monthStats: (StatsMonthly | undefined)[] = statsMonthlySnaps.map((s) => (s.exists() ? { ...s.data(), id: s.id } : undefined));
  const monthBudget: (StatsBudgetProgress | undefined)[] = statsBudgetSnaps.map((s) => (s.exists() ? s.data() : undefined));

  const periodTransactions = periodTxSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as FirestoreTransaction);

  // ---- Balance sheet (live snapshot — see this file's header) ----
  const assets: BalanceSheetRow[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    balance: toDisplay(ctx, a.currentBalance, a.currency),
    currency: ctx.display,
  }));
  const liabilities: BalanceSheetRow[] = debts.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.debtType,
    balance: toDisplay(ctx, d.currentBalance, d.currency),
    currency: ctx.display,
  }));
  const totalAssets = round2(assets.reduce((s, a) => s + a.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((s, l) => s + l.balance, 0));
  const netWorth = round2(totalAssets - totalLiabilities);
  const composition = assets
    .filter((a) => a.balance > 0)
    .map((a) => ({ name: a.name, value: a.balance, percent: round2(pct(a.balance, totalAssets)) }))
    .sort((a, b) => b.value - a.value);
  const highestPriorityDebt = [...debts].sort((a, b) => b.currentBalance - a.currentBalance)[0];
  const debtPayoffOpportunity = highestPriorityDebt
    ? `Paying an extra amount toward "${highestPriorityDebt.name}" (largest balance) shortens its payoff timeline the most per unit paid — see Goals & Debt Summary for its current pace.`
    : null;

  // ---- Cash flow trend (trailing 12 + period sums) ----
  const trend: MonthPoint[] = trailing12.map((m, i) => {
    const s = monthStats[i];
    const income = toDisplay(ctx, s?.totalIncome ?? 0, ctx.base);
    const expense = toDisplay(ctx, s?.totalExpense ?? 0, ctx.base);
    return { monthKey: m.key, label: m.label, income: round2(income), expense: round2(expense), net: round2(income - expense), savingsRate: round2(pct(income - expense, income)) };
  });
  const periodPoints = trend.filter((p) => periodMonthKeys.has(p.monthKey));
  const periodIncome = round2(periodPoints.reduce((s, p) => s + p.income, 0));
  const periodExpense = round2(periodPoints.reduce((s, p) => s + p.expense, 0));
  const periodNet = round2(periodIncome - periodExpense);
  const periodSavingsRate = round2(pct(periodNet, periodIncome));

  // Category income/expense breakdown for the period — sum each month's
  // perCategorySpend for months inside the period, split by the category's
  // own transactionType (perCategorySpend's sign convention is expense-
  // positive; an Income category's contribution there is negative, hence
  // the -amount below for income categories).
  const periodCategoryTotals = new Map<string, number>();
  trailing12.forEach((m, i) => {
    if (!periodMonthKeys.has(m.key)) return;
    const spend = monthStats[i]?.perCategorySpend ?? {};
    for (const [catId, amountBase] of Object.entries(spend)) {
      periodCategoryTotals.set(catId, (periodCategoryTotals.get(catId) ?? 0) + toDisplay(ctx, amountBase, ctx.base));
    }
  });
  const incomeBreakdown: CategoryAmount[] = [];
  const expenseBreakdown: CategoryAmount[] = [];
  for (const [catId, amount] of periodCategoryTotals) {
    const cat = categoryById.get(catId);
    const name = cat?.name ?? catId;
    if (cat?.transactionType === 'Income') {
      const value = round2(-amount);
      if (value > 0) incomeBreakdown.push({ categoryId: catId, name, amount: value, percent: 0 });
    } else if (amount > 0) {
      expenseBreakdown.push({ categoryId: catId, name, amount: round2(amount), percent: 0 });
    }
  }
  incomeBreakdown.sort((a, b) => b.amount - a.amount).forEach((row) => (row.percent = round2(pct(row.amount, periodIncome))));
  expenseBreakdown.sort((a, b) => b.amount - a.amount).forEach((row) => (row.percent = round2(pct(row.amount, periodExpense))));

  const wastefulAlerts: WastefulAlert[] = [];
  const diningPercent = expenseBreakdown
    .filter((row) => matchesKeyword(row.name, DINING_ENTERTAINMENT_KEYWORDS))
    .reduce((s, row) => s + row.percent, 0);
  if (diningPercent > 5) {
    wastefulAlerts.push({
      category: 'Dining & entertainment',
      percent: round2(diningPercent),
      status: diningPercent > 12 ? 'red' : diningPercent > 8 ? 'yellow' : 'yellow',
      message:
        diningPercent > 12
          ? 'Excessive — dining/entertainment spend is crowding out other goals.'
          : diningPercent > 8
            ? 'High — worth capping.'
            : 'Watch — creeping up.',
    });
  }
  const shoppingPercent = expenseBreakdown.filter((row) => matchesKeyword(row.name, SHOPPING_KEYWORDS)).reduce((s, row) => s + row.percent, 0);
  if (shoppingPercent > 3) {
    wastefulAlerts.push({
      category: 'Shopping',
      percent: round2(shoppingPercent),
      status: shoppingPercent > 7 ? 'red' : shoppingPercent > 5 ? 'yellow' : 'yellow',
      message: shoppingPercent > 7 ? 'Excessive — review discretionary purchases.' : shoppingPercent > 5 ? 'Elevated.' : 'Watch.',
    });
  }
  const subscriptionTotal = expenseBreakdown.filter((row) => matchesKeyword(row.name, SUBSCRIPTION_KEYWORDS)).reduce((s, row) => s + row.amount, 0);
  if (subscriptionTotal > 15000) {
    wastefulAlerts.push({ category: 'Subscriptions', percent: round2(pct(subscriptionTotal, periodExpense)), status: 'yellow', message: `Bloated — ${Math.round(subscriptionTotal).toLocaleString()} ${ctx.display}/period across subscriptions, review for unused ones.` });
  }

  // ---- Spending habits: top categories, volatility, top descriptions ----
  const categorySpendTotals = new Map<string, number>();
  trailing12.forEach((_, i) => {
    const spend = monthStats[i]?.perCategorySpend ?? {};
    for (const [catId, amountBase] of Object.entries(spend)) {
      const cat = categoryById.get(catId);
      if (cat?.transactionType === 'Income') continue;
      categorySpendTotals.set(catId, (categorySpendTotals.get(catId) ?? 0) + toDisplay(ctx, amountBase, ctx.base));
    }
  });
  const topCategoryIds = [...categorySpendTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
  const categoryTrends = topCategoryIds.map((catId) => ({
    categoryId: catId,
    name: categoryById.get(catId)?.name ?? catId,
    months: trailing12.map((_, i) => round2(toDisplay(ctx, monthStats[i]?.perCategorySpend?.[catId] ?? 0, ctx.base))),
  }));
  const volatility: CategoryVolatility[] = categoryTrends.map((c) => {
    const avg = mean(c.months);
    const sd = stdDev(c.months);
    const cv = round2(pct(sd, avg));
    const status: Status = cv < 15 ? 'green' : cv <= 30 ? 'yellow' : 'red';
    return {
      categoryId: c.categoryId,
      name: c.name,
      avg: round2(avg),
      stdDev: round2(sd),
      cv,
      status,
      issue: cv > 40 ? 'Chaotic — highly unpredictable spend' : cv > 30 ? 'Highly variable' : null,
    };
  });

  // Top categories by the PERIOD's own transactions (not the trailing-12
  // totals categoryTrends/volatility use above) — same spend-only filter
  // (Outflow: Expense + Savings) the old merchant-grouping attempt used,
  // just grouped by categoryId instead of free-text description.
  const topCategoryTotals = new Map<string, { total: number; count: number }>();
  for (const t of periodTransactions) {
    if (t.direction !== 'Outflow') continue;
    const key = t.categoryId ?? 'uncategorized';
    const entry = topCategoryTotals.get(key) ?? { total: 0, count: 0 };
    entry.total += toDisplay(ctx, t.amount, accounts.find((a) => a.id === t.accountId)?.currency ?? ctx.base);
    entry.count += 1;
    topCategoryTotals.set(key, entry);
  }
  const topCategories: TopCategoryRow[] = [...topCategoryTotals.entries()]
    .map(([catId, v]) => ({ categoryId: catId, name: categoryById.get(catId)?.name ?? 'Uncategorized', total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const recurringCategoryIds = new Set(budgetRules.filter((r) => r.frequency !== 'Once').map((r) => r.categoryId));
  let recurringTotal = 0;
  let variableTotal = 0;
  for (const row of expenseBreakdown) {
    if (recurringCategoryIds.has(row.categoryId)) recurringTotal += row.amount;
    else variableTotal += row.amount;
  }

  const notes: string[] = [];
  if (expenseBreakdown[0]) {
    notes.push(`"${expenseBreakdown[0].name}" was the largest expense category this period at ${Math.round(expenseBreakdown[0].amount).toLocaleString()} ${ctx.display} (${expenseBreakdown[0].percent}% of spend).`);
  }
  const mostVolatile = [...volatility].sort((a, b) => b.cv - a.cv)[0];
  if (mostVolatile && mostVolatile.cv > 15) {
    notes.push(`"${mostVolatile.name}" is the least predictable category (${mostVolatile.cv}% coefficient of variation) — a candidate for a fixed weekly cap.`);
  }

  // ---- Budget adherence ----
  const rows: BudgetVarianceRow[] = [];
  for (const rule of budgetRules) {
    let budgeted = 0;
    let actual = 0;
    let monthsApplied = 0;
    trailing12.forEach((m, i) => {
      if (!periodMonthKeys.has(m.key)) return;
      const entry = monthBudget[i]?.[rule.id];
      if (!entry) return;
      budgeted += entry.budgeted;
      actual += entry.spent;
      monthsApplied++;
    });
    if (monthsApplied === 0) continue;
    const variancePercent = round2(pct(actual - budgeted, budgeted));
    const status: Status = variancePercent <= 0 ? 'green' : variancePercent <= 10 ? 'yellow' : 'red';
    const monthlyOverage = (actual - budgeted) / monthsInPeriod;
    rows.push({
      ruleId: rule.id,
      categoryId: rule.categoryId,
      name: categoryById.get(rule.categoryId)?.name ?? rule.description,
      budgeted: round2(budgeted),
      actual: round2(actual),
      variancePercent,
      status,
      annualImpact: round2(monthlyOverage * 12),
    });
  }
  rows.sort((a, b) => b.variancePercent - a.variancePercent);

  // Consistency score: % of the trailing 12 months where a rule's own
  // variance stayed within +-10%, averaged across every rule that had at
  // least one applicable month — CONSISTENCY_SCORE from the guide, run
  // per-rule then rolled up into one headline number.
  const chronicOverages: ChronicOverage[] = [];
  const perRuleScores: number[] = [];
  for (const rule of budgetRules) {
    let applicable = 0;
    let withinBand = 0;
    let currentStreak = 0;
    const flaggedMonths: string[] = [];
    trailing12.forEach((m, i) => {
      const entry = monthBudget[i]?.[rule.id];
      if (!entry || entry.budgeted <= 0) {
        currentStreak = 0;
        return;
      }
      applicable++;
      const variance = pct(entry.spent - entry.budgeted, entry.budgeted);
      if (Math.abs(variance) <= 10) withinBand++;
      if (variance > 25) {
        currentStreak++;
        if (currentStreak >= 2) flaggedMonths.push(m.key);
      } else {
        currentStreak = 0;
      }
    });
    if (applicable > 0) perRuleScores.push(pct(withinBand, applicable));
    if (flaggedMonths.length > 0) {
      chronicOverages.push({ ruleId: rule.id, name: categoryById.get(rule.categoryId)?.name ?? rule.description, months: flaggedMonths });
    }
  }
  const consistencyScore = round2(mean(perRuleScores));

  // ---- Financial health metrics ----
  const trailingIncomes = trend.map((p) => p.income);
  const trailingExpenses = trend.map((p) => p.expense);
  const avgMonthlyExpenseLast3 = mean(trailing12.slice(-3).map((_, idx) => trend[trend.length - 3 + idx].expense));
  const liquidAssets = round2(assets.reduce((s, a) => s + a.balance, 0));
  const monthsOfExpenses = avgMonthlyExpenseLast3 > 0 ? round2(liquidAssets / avgMonthlyExpenseLast3) : liquidAssets > 0 ? Infinity : 0;
  const avgMonthlyIncomeTrailing = mean(trailingIncomes);
  const totalMonthlyDebtPayments = debts.reduce((s, d) => {
    if (d.paymentPlan.type === 'recurring' && d.paymentPlan.recurring?.isActive) return s + monthlyEquivalent(d.paymentPlan.recurring);
    return s;
  }, 0);
  const debtToIncomeRatio = round2(pct(totalLiabilities, avgMonthlyIncomeTrailing * 12));
  const debtPaymentRatio = round2(pct(totalMonthlyDebtPayments, avgMonthlyIncomeTrailing));
  const expenseRatio = round2(pct(periodExpense, periodIncome));
  const overallCv = round2(pct(stdDev(trailingExpenses), mean(trailingExpenses)));

  function savingsRateStatus(v: number): { status: Status; label: string } {
    if (v < 0) return { status: 'red', label: 'Spending more than earning' };
    if (v < 10) return { status: 'red', label: 'Barely saving' };
    if (v < 15) return { status: 'yellow', label: 'Modest savings' };
    if (v < 20) return { status: 'yellow', label: 'Acceptable but not enough' };
    if (v < 30) return { status: 'green', label: 'Good savings rate' };
    return { status: 'green', label: 'Excellent savings' };
  }
  function monthsOfExpensesStatus(v: number): { status: Status; label: string } {
    if (v < 0.5) return { status: 'red', label: 'CRITICAL' };
    if (v < 1) return { status: 'red', label: 'LOW' };
    if (v < 2) return { status: 'yellow', label: 'FAIR' };
    if (v < 3) return { status: 'yellow', label: 'GOOD' };
    if (v < 6) return { status: 'green', label: 'EXCELLENT' };
    return { status: 'green', label: 'VERY SAFE' };
  }
  function cvStatus(v: number): { status: Status; label: string } {
    if (v < 10) return { status: 'green', label: 'Predictable' };
    if (v < 20) return { status: 'yellow', label: 'Somewhat variable' };
    if (v < 40) return { status: 'red', label: 'Highly variable' };
    return { status: 'red', label: 'Chaotic' };
  }
  // The guide gives explicit bands for savings rate / months-of-expenses /
  // CV; debt-to-income, debt-payment, and expense ratio don't get one
  // there, so these three use the commonly-cited personal-finance
  // rules-of-thumb (28/36 rule territory) as a sensible, clearly-labeled
  // default rather than an arbitrary guess.
  function debtToIncomeStatus(v: number): { status: Status; label: string } {
    if (v < 20) return { status: 'green', label: 'Manageable' };
    if (v < 40) return { status: 'yellow', label: 'Elevated' };
    return { status: 'red', label: 'High' };
  }
  function debtPaymentStatus(v: number): { status: Status; label: string } {
    if (v < 20) return { status: 'green', label: 'Comfortable' };
    if (v < 36) return { status: 'yellow', label: 'Stretched' };
    return { status: 'red', label: 'Overextended' };
  }
  function expenseRatioStatus(v: number): { status: Status; label: string } {
    if (v < 70) return { status: 'green', label: 'Healthy margin' };
    if (v < 90) return { status: 'yellow', label: 'Thin margin' };
    return { status: 'red', label: 'Living at/beyond means' };
  }

  const savingsRateHealth = savingsRateStatus(periodSavingsRate);
  const monthsHealth = monthsOfExpensesStatus(Number.isFinite(monthsOfExpenses) ? monthsOfExpenses : 999);
  const dtiHealth = debtToIncomeStatus(debtToIncomeRatio);
  const dprHealth = debtPaymentStatus(debtPaymentRatio);
  const expenseRatioHealth = expenseRatioStatus(expenseRatio);
  const cvHealth = cvStatus(overallCv);

  const metrics: HealthMetric[] = [
    { key: 'savingsRate', label: 'Savings rate', value: periodSavingsRate, isPercent: true, status: savingsRateHealth.status, statusLabel: savingsRateHealth.label },
    { key: 'monthsOfExpenses', label: 'Months of expenses covered', value: Number.isFinite(monthsOfExpenses) ? monthsOfExpenses : 99, isPercent: false, status: monthsHealth.status, statusLabel: monthsHealth.label },
    { key: 'debtToIncome', label: 'Debt-to-income ratio', value: debtToIncomeRatio, isPercent: true, status: dtiHealth.status, statusLabel: dtiHealth.label },
    { key: 'debtPaymentRatio', label: 'Debt payment ratio', value: debtPaymentRatio, isPercent: true, status: dprHealth.status, statusLabel: dprHealth.label },
    { key: 'expenseRatio', label: 'Expense ratio', value: expenseRatio, isPercent: true, status: expenseRatioHealth.status, statusLabel: expenseRatioHealth.label },
    { key: 'volatility', label: 'Spending volatility (CV)', value: overallCv, isPercent: true, status: cvHealth.status, statusLabel: cvHealth.label },
  ];
  const statusRank: Record<Status, number> = { red: 2, yellow: 1, green: 0 };
  const overallStatus: Status = metrics.reduce((worst, m) => (statusRank[m.status] > statusRank[worst] ? m.status : worst), 'green' as Status);
  const overallSummary =
    overallStatus === 'green'
      ? 'Overall financial health looks solid this period — every core metric is in a healthy range.'
      : overallStatus === 'yellow'
        ? 'Overall financial health is mixed — some metrics need attention before they become a real problem.'
        : 'Overall financial health needs attention now — at least one core metric is in the red.';
  const incomeLossContingency = Number.isFinite(monthsOfExpenses)
    ? `If income stopped today, current liquid assets would cover about ${monthsOfExpenses.toFixed(1)} months of expenses at the recent average spend rate.`
    : 'No recent expense history to estimate an income-loss runway from yet.';
  const rankedByUrgency = [...metrics]
    .sort((a, b) => statusRank[b.status] - statusRank[a.status])
    .map((m) => ({ label: m.label, status: m.status, note: m.statusLabel }));

  // ---- Red flags (rules engine) ----
  const redFlags: RedFlag[] = [];
  const discretionaryPercent = round2(diningPercent + shoppingPercent);
  if (netWorth < 0 && expenseRatio > 75) {
    redFlags.push({ id: 'net-worth-expense-ratio', title: 'Debt is growing', message: `Net worth is negative and expenses are ${expenseRatio}% of income — debt is growing because expenses are too high.` });
  }
  if (Number.isFinite(monthsOfExpenses) && monthsOfExpenses < 2 && discretionaryPercent > 8) {
    redFlags.push({ id: 'emergency-fund-discretionary', title: 'Underfunded emergency fund, high discretionary spend', message: `Only ${monthsOfExpenses.toFixed(1)} months of expenses saved, but ${discretionaryPercent}% of spend is discretionary (dining/shopping).` });
  }
  const last3SavingsRates = trend.slice(-3).map((p) => p.savingsRate);
  if (last3SavingsRates.length === 3 && last3SavingsRates[2] < last3SavingsRates[1] && last3SavingsRates[1] < last3SavingsRates[0]) {
    redFlags.push({ id: 'savings-declining', title: 'Savings rate declining', message: 'Savings rate has fallen for two months running — creeping expenses detected.' });
  }
  for (const overage of chronicOverages) {
    redFlags.push({ id: `chronic-${overage.ruleId}`, title: `Chronic overspend: ${overage.name}`, message: `Over budget by more than 25% for ${overage.months.length} consecutive month(s) — a pattern, not a one-off, worth intervening on.` });
  }
  const discretionaryVolatile = volatility.find((v) => (matchesKeyword(v.name, DINING_ENTERTAINMENT_KEYWORDS) || matchesKeyword(v.name, SHOPPING_KEYWORDS)) && v.cv > 30);
  if (discretionaryVolatile) {
    redFlags.push({ id: `volatile-${discretionaryVolatile.categoryId}`, title: `"${discretionaryVolatile.name}" is a budget black hole`, message: `${discretionaryVolatile.cv}% coefficient of variation — enforce a weekly cap rather than a monthly one.` });
  }

  // ---- Executive summary stat cards + net worth sparkline ----
  const statCards: StatCard[] = [
    { key: 'netWorth', label: 'Net worth', value: netWorth, isPercent: false, trend: netWorth >= 0 ? 'up' : 'down', status: netWorth >= 0 ? 'green' : 'red', subtitle: `${assets.length} wallet(s), ${liabilities.length} debt(s)` },
    { key: 'savingsRate', label: 'Savings rate', value: periodSavingsRate, isPercent: true, trend: periodSavingsRate >= 0 ? 'up' : 'down', status: savingsRateHealth.status, subtitle: savingsRateHealth.label },
    { key: 'monthsSafe', label: 'Months safe (emergency fund)', value: Number.isFinite(monthsOfExpenses) ? monthsOfExpenses : 99, isPercent: false, trend: 'flat', status: monthsHealth.status, subtitle: monthsHealth.label },
    { key: 'totalDebt', label: 'Total debt', value: totalLiabilities, isPercent: false, trend: totalLiabilities > 0 ? 'down' : 'flat', status: totalLiabilities > 0 ? 'yellow' : 'green', subtitle: `${liabilities.length} open debt(s)` },
  ];

  // Estimated net worth sparkline: walked BACKWARD from today's real net
  // worth using each trailing month's own net cash flow (net worth at the
  // start of month M = net worth at its end minus that month's net) — the
  // only way to approximate a historical series without a stored daily
  // balance ledger (see this file's header). Assumes no asset value moved
  // for a reason other than recorded income/expense/transfers, which holds
  // for a cash-only ledger like this one.
  const sparkline: { label: string; value: number }[] = [];
  let running = netWorth;
  for (let i = trend.length - 1; i >= 0; i--) {
    sparkline.unshift({ label: trend[i].label, value: round2(running) });
    running -= trend[i].net;
  }

  const activeGoals = goals;
  const goalsStatus = {
    total: activeGoals.length,
    completed: activeGoals.filter((g) => g.totalAmount > 0 && g.amountCompleted >= g.totalAmount).length,
    totalTarget: round2(activeGoals.reduce((s, g) => s + g.totalAmount, 0)),
    totalSaved: round2(activeGoals.reduce((s, g) => s + g.amountCompleted, 0)),
  };
  const debtMonthsToPayoffList = debts.map((d) => monthsToPayoff(d)).filter((v): v is number => v != null);
  const debtStatus = {
    totalDebt: totalLiabilities,
    debtCount: debts.length,
    monthsToPayoffAvg: debtMonthsToPayoffList.length > 0 ? round2(mean(debtMonthsToPayoffList)) : null,
  };

  // ---- Goals & Debt summary ----
  const goalRows: GoalRow[] = activeGoals.map((g) => ({
    goalId: g.id,
    name: g.name,
    totalAmount: g.totalAmount,
    amountCompleted: g.amountCompleted,
    percent: round2(pct(g.amountCompleted, g.totalAmount)),
    deadline: g.deadline ? g.deadline.toDate().toISOString().slice(0, 10) : null,
  }));
  const debtRows: DebtRow[] = debts.map((d) => ({
    debtId: d.id,
    name: d.name,
    principalAmount: d.principalAmount,
    currentBalance: d.currentBalance,
    totalRepaid: d.totalRepaid,
    monthsToPayoff: monthsToPayoff(d),
    priority: d.priority,
  }));
  const fastestPayoff = [...debtRows].filter((d) => d.monthsToPayoff != null).sort((a, b) => (a.monthsToPayoff ?? Infinity) - (b.monthsToPayoff ?? Infinity))[0];
  const payoffOpportunity = fastestPayoff
    ? `"${fastestPayoff.name}" is on pace to be paid off in about ${fastestPayoff.monthsToPayoff} month(s) at its current recurring payment — the closest win available.`
    : debtRows.length > 0
      ? 'No debt here has an active recurring payment plan set — setting one up is the first step toward a real payoff timeline.'
      : null;

  // ---- Appendix ----
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const APPENDIX_LIMIT = 500;
  const appendixSource = periodTransactions.slice(0, APPENDIX_LIMIT);
  const appendixTransactions: AppendixTransaction[] = appendixSource.map((t) => ({
    id: t.id,
    date: t.date.toDate().toISOString().slice(0, 10),
    description: t.description,
    account: accountById.get(t.accountId)?.name ?? t.accountId,
    category: categoryById.get(t.categoryId ?? '')?.name ?? '—',
    type: t.type,
    amount: round2(toDisplay(ctx, t.amount, accountById.get(t.accountId)?.currency ?? ctx.base)),
  }));
  const appendixCategoryTotals = new Map<string, { total: number; count: number }>();
  for (const t of periodTransactions) {
    const catId = t.categoryId ?? 'uncategorized';
    const entry = appendixCategoryTotals.get(catId) ?? { total: 0, count: 0 };
    entry.total += toDisplay(ctx, t.amount, accountById.get(t.accountId)?.currency ?? ctx.base);
    entry.count += 1;
    appendixCategoryTotals.set(catId, entry);
  }
  const totalsByCategory = [...appendixCategoryTotals.entries()]
    .map(([catId, v]) => ({ categoryId: catId, name: categoryById.get(catId)?.name ?? 'Uncategorized', total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total);

  const data: AuditReportData = {
    meta: {
      period: selection.period,
      periodKey,
      periodLabel,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      currency: ctx.display,
    },
    executiveSummary: {
      statCards,
      redFlags,
      netWorthSparkline: sparkline,
      netWorthSparklineNote: "Estimated by working backward from today's actual net worth using each month's recorded net cash flow — not a stored historical balance.",
      goalsStatus,
      debtStatus,
    },
    balanceSheet: {
      asOfNote: `Wallet and debt balances reflect the moment this report was generated (${new Date().toLocaleDateString()}), not the end of ${periodLabel}.`,
      assets,
      liabilities,
      totalAssets,
      totalLiabilities,
      netWorth,
      composition,
      debtPayoffOpportunity,
    },
    cashFlow: { periodIncome, periodExpense, periodNet, periodSavingsRate, trend, incomeBreakdown, expenseBreakdown, wastefulAlerts },
    spendingHabits: {
      categoryTrends,
      monthlyBreakdown: periodPoints,
      volatility,
      topCategories,
      recurringVsVariable: { recurring: round2(recurringTotal), variable: round2(variableTotal) },
      notes,
    },
    budgetAdherence: { rows, consistencyScore, chronicOverages },
    financialHealth: { metrics, overallStatus, overallSummary, incomeLossContingency, rankedByUrgency },
    goalsDebt: { goals: goalRows, debts: debtRows, payoffOpportunity },
    appendix: { transactions: appendixTransactions, truncatedCount: Math.max(0, periodTransactions.length - APPENDIX_LIMIT), totalsByCategory },
  };

  return data;
}

// ---------------------------------------------------------------------------
// Persistence — "generate and keep": every generate call writes a brand new
// immutable snapshot document, never overwrites a previous one.
// ---------------------------------------------------------------------------

export async function saveAuditReport(uid: string, selection: AuditReportSelection, data: AuditReportData): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(auditReportRef(uid, id), {
    period: selection.period,
    periodKey: data.meta.periodKey,
    periodLabel: data.meta.periodLabel,
    generatedAt: Timestamp.now(),
    data,
  });
  return id;
}

export async function listAuditReports(uid: string): Promise<FirestoreAuditReport[]> {
  const snap = await getDocs(query(auditReportsRef(uid), orderBy('generatedAt', 'desc')));
  return snap.docs.map((d) => ({ ...(d.data() as DocumentData), id: d.id }) as FirestoreAuditReport);
}

export async function getAuditReport(uid: string, reportId: string): Promise<FirestoreAuditReport | null> {
  const snap = await getDoc(auditReportRef(uid, reportId));
  return snap.exists() ? ({ ...(snap.data() as DocumentData), id: snap.id } as FirestoreAuditReport) : null;
}

export async function deleteAuditReport(uid: string, reportId: string): Promise<void> {
  await deleteDoc(auditReportRef(uid, reportId));
}
