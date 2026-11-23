// Month on month (and week on week) accountability (owner, 23 Nov 2026).
//
// "Unaccounted for" used to be one running figure, so November's missing
// money was still in December's. Each period now carries its own:
//
//   recorded    = the gaps the balance checks dated in the period found
//                 (signed: a surplus lowers it)
//   explained   = what was later explained against the period: expenses
//                 paid from "Unaccounted money" (and income put back
//                 against it) dated in the period, plus money moved out of
//                 "Unaccounted money" into a real wallet dated in it
//   unaccounted = recorded − explained, never below zero
//
// An entry belongs to the period of its transaction date, not the day it
// was typed in: explaining November money in December lowers November.
//
//   outflow     = money that left the household in the period: expenses
//                 and other outflows (including those paid from
//                 "Unaccounted money"), transfers to anywhere that is not
//                 one of the household's own wallets, and transfer fees.
//                 Transfers between the household's own wallets (savings
//                 moves included) are not outflow.
//   rate        = 1 − unaccounted ÷ outflow, between 0 and 1; null when
//                 nothing went out ("No spending", never 100%).
//
// Weeks run Monday to Sunday and every date is placed in the household's
// time zone (Africa/Douala unless set). Pure: tested in
// test/accountability.test.ts. No stored running total is read.

export const DEFAULT_TIME_ZONE = 'Africa/Douala';
export const UNACCOUNTED_WALLET = 'unjustified';

export type Period = 'month' | 'week';

export interface TxLike {
  date: Date;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  accountId: string;
  isUnjustifiedAdjustment?: boolean;
  isFrozenSavings?: boolean;
  pairedTransferId?: string | null;
  excluded?: boolean;
}

export interface TransferLike {
  id: string;
  date: Date;
  amount: number;
  charges?: number;
  fromAccountId: string;
  toAccountId: string | null;
}

export interface CheckLike {
  performedAt: Date;
  /** Signed: ledger minus reported. Positive is money missing. */
  totalGap: number;
}

export interface PeriodAccountability {
  /** "2026-11" for a month, the Monday "2026-11-16" for a week. */
  key: string;
  /** "November 2026", or "16 to 22 Nov". */
  label: string;
  /** "November", or "the week of 16 Nov": for sentences. */
  name: string;
  checks: number;
  /** The latest balance check dated in the period. */
  lastCheckAt: Date | null;
  recorded: number;
  explained: number;
  unaccounted: number;
  outflow: number;
  /** 0 to 1, or null when nothing went out. */
  rate: number | null;
  /** Against the period before: unaccounted (amount) and rate (points, 0 to 1). */
  change: { unaccounted: number | null; rate: number | null };
}

export interface ByPeriodOptions {
  period: Period;
  /** The periods ending with the one holding `end`, `count` of them. */
  range: { end: Date; count: number };
  transfers?: TransferLike[];
  timeZone?: string;
  /** The id of the "Unaccounted money" wallet (default "unjustified"). */
  unaccountedWalletId?: string;
  /** Every wallet the household owns (archived included). A transfer to any
   *  other id counts as outflow. Left out: every transfer is between own
   *  wallets, so only its fee counts. */
  ownWalletIds?: Set<string>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

const partsCache = new Map<string, Intl.DateTimeFormat>();
/** The calendar day a moment falls on in a time zone. */
export function localDay(d: Date, timeZone: string = DEFAULT_TIME_ZONE): { y: number; m: number; d: number } {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
    partsCache.set(timeZone, f);
  }
  const parts = f.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Days since 1970-01-01 for a calendar date (time zone free). */
function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayNumber(n: number): { y: number; m: number; d: number } {
  const dt = new Date(n * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** The key of the period a moment falls in. */
export function periodKey(date: Date, period: Period, timeZone: string = DEFAULT_TIME_ZONE): string {
  const { y, m, d } = localDay(date, timeZone);
  if (period === 'month') return `${y}-${pad(m)}`;
  const n = dayNumber(y, m, d);
  const weekday = (new Date(n * 86_400_000).getUTCDay() + 6) % 7; // Monday 0
  const monday = fromDayNumber(n - weekday);
  return `${monday.y}-${pad(monday.m)}-${pad(monday.d)}`;
}

/** The `count` period keys ending with the one holding `end`, oldest first. */
export function periodKeys(end: Date, count: number, period: Period, timeZone: string = DEFAULT_TIME_ZONE): string[] {
  const last = periodKey(end, period, timeZone);
  const keys: string[] = [];
  if (period === 'month') {
    const [y, m] = last.split('-').map(Number);
    for (let i = count - 1; i >= 0; i--) {
      const total = y * 12 + (m - 1) - i;
      keys.push(`${Math.floor(total / 12)}-${pad((total % 12) + 1)}`);
    }
  } else {
    const [y, m, d] = last.split('-').map(Number);
    const n = dayNumber(y, m, d);
    for (let i = count - 1; i >= 0; i--) {
      const day = fromDayNumber(n - 7 * i);
      keys.push(`${day.y}-${pad(day.m)}-${pad(day.d)}`);
    }
  }
  return keys;
}

/** "November 2026" / "November", or "16 to 22 Nov" / "the week of 16 Nov". */
export function periodLabel(key: string, period: Period): { label: string; name: string } {
  if (period === 'month') {
    const [y, m] = key.split('-').map(Number);
    return { label: `${MONTHS[m - 1]} ${y}`, name: MONTHS[m - 1] };
  }
  const [y, m, d] = key.split('-').map(Number);
  const end = fromDayNumber(dayNumber(y, m, d) + 6);
  const label = end.m === m ? `${d} to ${end.d} ${SHORT[m - 1]}` : `${d} ${SHORT[m - 1]} to ${end.d} ${SHORT[end.m - 1]}`;
  return { label, name: `the week of ${d} ${SHORT[m - 1]}` };
}

/** The first moment of the oldest period in the range, for queries (a day
 *  early, so a time zone ahead of the device never drops an entry). */
export function rangeStart(end: Date, count: number, period: Period, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const first = periodKeys(end, count, period, timeZone)[0];
  const [y, m, d] = first.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d ?? 1) - 86_400_000);
}

export function unaccountedByPeriod(transactions: TxLike[], checks: CheckLike[], options: ByPeriodOptions): PeriodAccountability[] {
  const { period, range, transfers = [], timeZone = DEFAULT_TIME_ZONE, unaccountedWalletId = UNACCOUNTED_WALLET, ownWalletIds } = options;
  // One period earlier than shown, so the first shown period has a change.
  const keys = periodKeys(range.end, range.count + 1, period, timeZone);
  const blank = () => ({ checks: 0, lastCheckAt: null as Date | null, recorded: 0, explained: 0, outflow: 0 });
  const acc = new Map(keys.map((k) => [k, blank()]));
  const at = (d: Date) => acc.get(periodKey(d, period, timeZone));

  for (const c of checks) {
    const p = at(c.performedAt);
    if (!p) continue;
    p.checks += 1;
    if (!p.lastCheckAt || c.performedAt > p.lastCheckAt) p.lastCheckAt = c.performedAt;
    p.recorded += c.totalGap;
  }

  const paired = new Set<string>();
  for (const t of transactions) {
    if (t.pairedTransferId) paired.add(t.pairedTransferId);
    if (t.excluded) continue;
    const p = at(t.date);
    if (!p) continue;
    if (t.isUnjustifiedAdjustment || t.accountId === unaccountedWalletId) {
      p.explained += t.direction === 'Outflow' ? t.amount : -t.amount;
    }
    if (t.direction === 'Outflow' && !t.isFrozenSavings) p.outflow += t.amount;
  }

  for (const tr of transfers) {
    const p = at(tr.date);
    if (!p) continue;
    const fromUnaccounted = tr.fromAccountId === unaccountedWalletId;
    const toUnaccounted = tr.toAccountId === unaccountedWalletId;
    // Money moved out of "Unaccounted money" into a real wallet was found:
    // it explains part of the gap. A transfer paired with an explained
    // expense is that expense's own leg, already counted.
    if (fromUnaccounted && !toUnaccounted && !paired.has(tr.id)) p.explained += tr.amount;
    if (fromUnaccounted || toUnaccounted) continue;
    p.outflow += tr.charges ?? 0;
    const toOwn = tr.toAccountId != null && (!ownWalletIds || ownWalletIds.has(tr.toAccountId));
    if (!toOwn) p.outflow += tr.amount;
  }

  const rows: PeriodAccountability[] = keys.map((key) => {
    const p = acc.get(key)!;
    const recorded = r2(p.recorded);
    const explained = r2(p.explained);
    const unaccounted = r2(Math.max(0, recorded - explained));
    const outflow = r2(p.outflow);
    const rate = outflow > 0 ? Math.max(0, Math.min(1, 1 - unaccounted / outflow)) : null;
    return { key, ...periodLabel(key, period), checks: p.checks, lastCheckAt: p.lastCheckAt, recorded, explained, unaccounted, outflow, rate, change: { unaccounted: null, rate: null } };
  });
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    rows[i].change = {
      unaccounted: r2(rows[i].unaccounted - prev.unaccounted),
      rate: rows[i].rate !== null && prev.rate !== null ? rows[i].rate! - prev.rate : null,
    };
  }
  return rows.slice(1);
}

/** "94%", or "No spending" for a period with nothing out. */
export function rateText(rate: number | null): string {
  return rate === null ? 'No spending' : `${Math.round(rate * 100)}%`;
}

/** "You accounted for 94% of your spending in November, up from 88% in October." */
export function accountabilitySentence(rows: PeriodAccountability[]): string {
  const cur = rows[rows.length - 1];
  if (!cur) return '';
  const prev = rows[rows.length - 2];
  if (cur.rate === null) return `No spending recorded in ${cur.name} yet.`;
  const pct = Math.round(cur.rate * 100);
  const head = `You accounted for ${pct}% of your spending in ${cur.name}`;
  if (!prev || prev.rate === null) return `${head}.`;
  const before = Math.round(prev.rate * 100);
  if (before === pct) return `${head}, the same as ${prev.name}.`;
  return `${head}, ${pct > before ? 'up' : 'down'} from ${before}% in ${prev.name}.`;
}
