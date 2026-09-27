// Finance Insights — where money goes (categories, buckets, fixed vs
// variable, trends, payees, payment methods) and the unplanned spending
// section (by kind, top categories/payees, largest transactions, pattern
// notes). Pure.

import type { TxPlanSplit, UnplannedKind } from './classify';
import type { FinData, FinTx } from './types';
import { inPeriod, monthKey, monthName, shiftMonthKey, type Period } from './ranges';
import { r2, txsIn } from './metrics';

const sum = <T>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);

export interface Slice {
  key: string;
  label: string;
  amount: number;
  share: number;
}

/** Top `n` by amount, the rest folded into "Other". */
export function topSlices(totals: Map<string, { label: string; amount: number }>, n = 6): Slice[] {
  const all = [...totals.entries()].map(([key, v]) => ({ key, ...v })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = sum(all, (x) => x.amount);
  const top = all.slice(0, n);
  const rest = all.slice(n);
  const out = top.map((x) => ({ key: x.key, label: x.label, amount: r2(x.amount), share: total ? x.amount / total : 0 }));
  if (rest.length) {
    const amount = sum(rest, (x) => x.amount);
    out.push({ key: 'other', label: 'Other', amount: r2(amount), share: total ? amount / total : 0 });
  }
  return out;
}

function tally<T>(list: T[], keyOf: (x: T) => string, labelOf: (x: T) => string, amountOf: (x: T) => number) {
  const out = new Map<string, { label: string; amount: number }>();
  for (const x of list) {
    const k = keyOf(x);
    const row = out.get(k) ?? { label: labelOf(x), amount: 0 };
    row.amount += amountOf(x);
    out.set(k, row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Where the money goes

export interface MoneyFlow {
  byCategory: Slice[];
  byBucket: Slice[];
  fixed: number;
  variable: number;
  trends: { key: string; label: string; values: number[]; change: number | null }[];
  trendMonths: string[];
  payees: Slice[];
  methods: Slice[];
  transferFees: number;
}

export function moneyFlow(data: FinData, p: Period, bucketName: (id: string) => string): MoneyFlow {
  const spend = txsIn(data, p).filter((t) => t.kind === 'expense' && t.amount > 0);
  const byCategory = topSlices(tally(spend, (t) => t.categoryId ?? 'none', (t) => t.categoryName, (t) => t.amount));
  const byBucket = topSlices(
    tally(spend, (t) => t.link?.bucketId ?? 'none', (t) => (t.link ? bucketName(t.link.bucketId) : 'No budget'), (t) => t.amount)
  );
  // Trends: the top categories over the last 6 months up to the period's end.
  const endMonth = monthKey(p.end < data.today ? p.end : data.today);
  const trendMonths = Array.from({ length: 6 }, (_, i) => shiftMonthKey(endMonth, i - 5));
  const trends = byCategory
    .filter((s) => s.key !== 'other')
    .slice(0, 4)
    .map((s) => {
      const values = trendMonths.map((m) => r2(sum(data.txs.filter((t) => t.kind === 'expense' && t.month === m && (t.categoryId ?? 'none') === s.key), (t) => t.amount)));
      const prior = values.slice(0, 5).filter((v) => v > 0);
      const avg = prior.length ? sum(prior, (v) => v) / prior.length : 0;
      return { key: s.key, label: s.label, values, change: avg > 0 ? (values[5] - avg) / avg : null };
    });
  return {
    byCategory,
    byBucket,
    fixed: r2(sum(spend.filter((t) => t.fixed), (t) => t.amount)),
    variable: r2(sum(spend.filter((t) => !t.fixed), (t) => t.amount)),
    trends,
    trendMonths,
    payees: topSlices(tally(spend, (t) => t.payee.trim().toLowerCase() || '—', (t) => t.payee.trim() || 'Unnamed', (t) => t.amount), 5).filter((s) => s.key !== 'other'),
    methods: topSlices(tally(spend, (t) => t.accountId, (t) => t.accountName, (t) => t.amount), 5),
    transferFees: r2(sum(data.transfers.filter((t) => inPeriod(t.date, p)), (t) => t.charges)),
  };
}

// ---------------------------------------------------------------------------
// Unplanned spending

export interface UnplannedTx {
  tx: FinTx;
  amount: number;
  kind: UnplannedKind;
}

export interface UnplannedInsights {
  total: number;
  share: number | null;
  byKind: Record<UnplannedKind, number>;
  categories: Slice[];
  payees: Slice[];
  largest: UnplannedTx[];
  notes: string[];
}

export function unplannedInsights(data: FinData, p: Period, splits: Map<string, TxPlanSplit>): UnplannedInsights {
  const spend = txsIn(data, p).filter((t) => t.kind === 'expense' && t.amount > 0);
  const flagged: UnplannedTx[] = spend
    .map((tx) => ({ tx, split: splits.get(tx.id) }))
    .filter((x): x is { tx: FinTx; split: TxPlanSplit } => Boolean(x.split && x.split.unplanned > 0 && x.split.kind))
    .map(({ tx, split }) => ({ tx, amount: split.unplanned, kind: split.kind! }));
  const expense = sum(spend, (t) => t.amount);
  const total = r2(sum(flagged, (x) => x.amount));
  const byKind = { no_budget: 0, added_after: 0, over_plan: 0 } as Record<UnplannedKind, number>;
  for (const t of spend) {
    const s = splits.get(t.id);
    if (!s) continue;
    byKind.no_budget += s.noBudget;
    byKind.added_after += s.addedAfter;
    byKind.over_plan += s.overPlan;
  }
  (Object.keys(byKind) as UnplannedKind[]).forEach((k) => (byKind[k] = r2(byKind[k])));

  const notes: string[] = [];
  // Weekends: at least half the unplanned money on Sat/Sun (with enough to judge).
  const weekend = sum(flagged.filter((x) => x.tx.date.getDay() === 0 || x.tx.date.getDay() === 6), (x) => x.amount);
  if (flagged.length >= 3 && total > 0 && weekend / total >= 0.5) notes.push('Most unplanned spending happens on weekends.');
  // A category unplanned several months running, up to the period's end.
  const endMonth = monthKey(p.end < data.today ? p.end : data.today);
  const categoryNames = new Map(data.txs.map((t) => [t.categoryId ?? 'none', t.categoryName]));
  const streaks: { name: string; months: number }[] = [];
  for (const [id, name] of categoryNames) {
    let months = 0;
    for (let m = endMonth; months < 12; m = shiftMonthKey(m, -1)) {
      const has = data.txs.some((t) => t.kind === 'expense' && t.month === m && (t.categoryId ?? 'none') === id && (splits.get(t.id)?.unplanned ?? 0) > 0);
      if (!has) break;
      months += 1;
    }
    if (months >= 3) streaks.push({ name, months });
  }
  for (const s of streaks.sort((a, b) => b.months - a.months).slice(0, 2)) {
    notes.push(`${s.name} is unplanned ${s.months} months in a row; consider adding it to your plan.`);
  }

  return {
    total,
    share: expense > 0 ? total / expense : null,
    byKind,
    categories: topSlices(tally(flagged, (x) => x.tx.categoryId ?? 'none', (x) => x.tx.categoryName, (x) => x.amount), 5).filter((s) => s.key !== 'other'),
    payees: topSlices(tally(flagged, (x) => x.tx.payee.trim().toLowerCase() || '—', (x) => x.tx.payee.trim() || 'Unnamed', (x) => x.amount), 5).filter((s) => s.key !== 'other'),
    largest: [...flagged].sort((a, b) => b.amount - a.amount).slice(0, 8),
    notes,
  };
}

export { monthName };
