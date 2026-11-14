// Money Insights, level one (Design-System BUILD-KIT 5.3, `Insights / Web`):
// a verdict on the period, up to three action cards derived from the data,
// and one chart of what was kept per bucket. Pure, built on the same input
// as the dashboard (MoneyInput), so the numbers agree with the full
// breakdown one level down.
//
// Action cards: each is a finding, the number that proves it and where to
// fix it. A card that does not clear its threshold is left out; fewer than
// three is normal, and none is a good month.

import { periodBuckets, trendUnit, type DashPeriod } from '../../shared/dashboard/period';
import { amount, compact, signedCompact } from '../../shared/dashboard/format';
import { flowsIn, txsIn, type MoneyInput } from './money';

export type ActionTone = 'danger' | 'warning' | 'info';
export type ActionKind = 'untracked' | 'unplanned' | 'debts';

export interface ActionCard {
  kind: ActionKind;
  tone: ActionTone;
  title: string;
  /** The finding, with the number that justifies it. */
  body: string;
  action: string;
  href: string;
}

export interface VerdictFigures {
  income: number;
  spending: number;
  /** Net change as a share of income (null with no income). */
  keptRate: number | null;
  untracked: number;
}

export interface MoneyVerdict {
  /** "1 January to 14 November". */
  range: string;
  headline: string;
  explanation: string;
  net: number;
  figures: VerdictFigures;
  actions: ActionCard[];
  chart: { points: { label: string; value: number | null }[]; caption: string | null };
}

/** A wallet must carry at least this share of the missing money to be named. */
export const UNTRACKED_WALLET_SHARE = 0.25;
/** Spending with no basket behind it, as a share of all spending. */
export const UNPLANNED_SHARE = 0.2;

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

function listWords(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function periodPhrase(p: DashPeriod) {
  if (p.kind === 'all') return 'so far';
  if (!p.inProgress) return `in ${p.label}`;
  return { day: 'today', week: 'this week', month: 'this month', quarter: 'this quarter', year: 'this year' }[p.kind];
}

function untrackedAction(input: MoneyInput, p: DashPeriod, totalMissing: number, income: number): ActionCard | null {
  if (totalMissing <= 0.5) return null;
  const inRange = input.checks.filter((c) => c.at >= p.start && c.at < p.to);
  const byWallet = new Map<string, number>();
  for (const c of inRange) for (const w of c.wallets) if (w.counted < w.recorded) byWallet.set(w.id, (byWallet.get(w.id) ?? 0) + (w.recorded - w.counted));
  const [topId, topMissing] = [...byWallet.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (!topId) return null;
  const share = topMissing / totalMissing;
  if (share < UNTRACKED_WALLET_SHARE || (income > 0 && topMissing < input.untrackedTarget * income)) return null;
  const wallet = input.wallets.find((w) => w.id === topId);
  if (!wallet) return null;
  const latest = [...input.checks].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  const othersMatched = latest ? latest.wallets.filter((w) => w.id !== topId).every((w) => Math.abs(w.counted - w.recorded) < 1) : false;
  return {
    kind: 'untracked',
    tone: 'danger',
    title: `Reconcile ${wallet.name}`,
    body: `${compact(topMissing)} of the ${compact(totalMissing)} that went missing ${periodPhrase(p)} came from this one wallet, ${pct(share)} of the total.${othersMatched ? ' Every other wallet matched at the last check.' : ''}`,
    action: 'Count that wallet',
    href: '/settings/reconcile',
  };
}

function unplannedAction(input: MoneyInput, p: DashPeriod, spent: number): ActionCard | null {
  if (spent <= 0) return null;
  const txs = txsIn(input.data, { start: p.start, end: p.to }).filter((t) => t.kind === 'expense');
  const noBasket = txs.map((t) => ({ t, amt: input.splits.get(t.id)?.noBudget ?? 0 })).filter((x) => x.amt > 0);
  const share = sum(noBasket, (x) => x.amt) / spent;
  if (share < UNPLANNED_SHARE) return null;
  // Categories that come back: in two or more months, or three or more times
  // in a single-month period.
  const months = new Set(txs.map((t) => t.month)).size;
  const byCategory = new Map<string, { amount: number; months: Set<string>; count: number }>();
  for (const { t, amt } of noBasket) {
    const c = byCategory.get(t.categoryName) ?? { amount: 0, months: new Set<string>(), count: 0 };
    c.amount += amt;
    c.months.add(t.month);
    c.count += 1;
    byCategory.set(t.categoryName, c);
  }
  const repeats = [...byCategory.entries()]
    .filter(([, c]) => (months >= 2 ? c.months.size >= 2 : c.count >= 3))
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 3);
  const named = repeats.map(([name, c]) => `${name} ${compact(c.amount)}`);
  return {
    kind: 'unplanned',
    tone: 'warning',
    title: repeats.length ? 'Give the repeats a basket' : 'Plan more of your spending',
    body: `${pct(share)} of your spending had no basket behind it.${
      named.length ? ` ${listWords(named)} ${named.length === 1 ? 'comes' : 'come'} back ${months >= 2 ? 'every month' : 'again and again'}, so ${named.length === 1 ? 'it' : 'they'} can be planned.` : ''
    }`,
    action: repeats.length ? 'Make the baskets' : 'Make a basket',
    href: '/baskets/new',
  };
}

function debtsAction(input: MoneyInput): ActionCard | null {
  const unplanned = input.debts.filter((d) => d.outstanding > 0.5 && d.monthly === null);
  if (!unplanned.length) return null;
  const total = sum(unplanned, (d) => d.outstanding);
  const all = input.debts.filter((d) => d.outstanding > 0.5).length;
  const many = unplanned.length > 1;
  return {
    kind: 'debts',
    tone: 'info',
    title: many ? 'Put the debts on a plan' : `Put ${unplanned[0].name} on a plan`,
    body: many
      ? `${compact(total)} is left across ${unplanned.length} debts${unplanned.length === all ? ' and not one has a payment plan' : ' with no payment plan'}, so none of it shows up in the queue or in the forecast.`
      : `${compact(total)} is left on it with no payment plan, so it does not show up in the queue or in the forecast.`,
    action: 'Set a plan',
    href: many ? '/debts' : `/debts/${unplanned[0].id}`,
  };
}

function chartFor(input: MoneyInput, p: DashPeriod) {
  const buckets = periodBuckets(p, 'money');
  const points = buckets.map((b) => {
    if (b.future) return { label: b.label, value: null };
    const f = flowsIn(input, { start: b.start, end: b.end });
    return { label: b.label, value: r2(f.income - f.spent) };
  });
  const past = points.filter((x): x is { label: string; value: number } => x.value !== null);
  if (past.length < 2) return { points, caption: null };
  const short = past.filter((x) => x.value < 0).map((x) => x.label);
  const last = past[past.length - 1];
  const backIndex = Math.max(0, past.length - 7);
  const ago = past.length - 1 - backIndex;
  const unit = { hour: 'hours', day: 'days', week: 'weeks', month: 'months', quarter: 'quarters', year: 'years' }[trendUnit(p.kind, 'money')];
  const turn = short.length ? `Spending beat income in ${listWords(short)}.` : 'Income beat spending every time.';
  return { points, caption: `${turn} The gap is ${signedCompact(last.value)} now, against ${signedCompact(past[backIndex].value)} ${ago === 1 ? 'one' : ago} ${ago === 1 ? unit.slice(0, -1) : unit} ago.` };
}

export function moneyVerdict(input: MoneyInput, p: DashPeriod): MoneyVerdict {
  const f = flowsIn(input, { start: p.start, end: p.to });
  const net = r2(f.income - f.spent - f.fees - f.netUntracked);
  const untracked = Math.max(0, f.netUntracked);
  const gap = f.income - f.spent;
  const when = periodPhrase(p);

  const headline = Math.abs(net) < 0.5 ? `You broke even ${when}` : `You are ${amount(Math.abs(net))} ${net > 0 ? 'up' : 'down'} ${when}`;
  const first = gap >= 0 ? `Income beat spending by ${compact(gap)}.` : `Spending beat income by ${compact(-gap)}.`;
  let second = '';
  if (untracked > 0.5) {
    second = ` But ${compact(untracked)} left your wallets with no record against it`;
    second += gap > 0 && untracked >= gap ? ', and that gap is the whole difference.' : '.';
  } else if (f.income > 0) {
    second = ' Every wallet you counted matched its records.';
  }

  const actions = [untrackedAction(input, p, f.missing, f.income), unplannedAction(input, p, f.spent), debtsAction(input)].filter((a): a is ActionCard => a !== null);
  const lastDay = new Date(p.to.getTime() - 1);

  return {
    range: `${day(p.start)} to ${day(lastDay)}`,
    headline,
    explanation: `${first}${second}`,
    net,
    figures: { income: f.income, spending: f.spent, keptRate: f.income > 0 ? net / f.income : null, untracked },
    actions,
    chart: chartFor(input, p),
  };
}
