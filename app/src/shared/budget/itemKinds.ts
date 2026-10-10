// The three ways money leaves a basket, and how income comes in. Every
// expense, savings and transfer item has a kind:
//   - payment: a fixed amount due on a date (rent, a subscription). Paid,
//     Due or Overdue; paying can be partial ("40,000 of 160,000 paid").
//   - allowance: money made available for the period and spent bit by bit
//     (food, transport, hangouts). Spent / Left and a pace; never overdue.
//   - set aside: money put away toward a target (an emergency fund).
//     Contributions accumulate across months; Saved / Target.
// Income items are a lump sum on a date, or a trickle of small receipts
// over the period (Received / Expected, with a pace). Transfer items have
// no kind: a transfer moves money between the household's own wallets
// (into one where it can be spent), so it's never a payment, never due or
// overdue, and only its fee is spending.
//
// Pure: reads the month's derived lines (monthBudget.ts's ItemMonth). Every
// screen takes these figures from here. Tested in test/basketKinds.test.ts.

import type { ExpenseKind, FlowType, IncomeMode, ItemKind } from '../firestore/types';
import type { BucketGroup, ItemMonth } from './monthBudget';

export type { ItemKind, IncomeMode };

export const ITEM_KINDS: ItemKind[] = ['payment', 'allowance', 'set_aside'];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { payment: 'Payment', allowance: 'Allowance', set_aside: 'Set aside' };
/** Group headings inside a basket. */
export const ITEM_KIND_GROUP: Record<ItemKind, string> = { payment: 'Payments', allowance: 'Allowances', set_aside: 'Set aside' };
export const INCOME_MODE_LABEL: Record<IncomeMode, string> = { lump_sum: 'Lump sum', trickle: 'Trickle' };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`;

export interface KindInference {
  flow: FlowType;
  /** The expense subtype (stored or inferred, flow.ts). */
  expenseKind?: ExpenseKind | null;
  hasDueDate: boolean;
  /** Linked transactions recorded against the item (any month). */
  transactionCount?: number;
}

/**
 * An item's kind: the stored one, or inferred the way the migration does
 * it. Savings are set asides; an expense with a set
 * amount and a due date is a payment, and one used through the month (a
 * variable expense, no due date, or many small transactions) an allowance.
 */
export function inferItemKind(signals: KindInference): ItemKind {
  if (signals.flow === 'Savings') return 'set_aside';
  if ((signals.transactionCount ?? 0) >= 3) return 'allowance';
  if (signals.expenseKind === 'variable') return 'allowance';
  if (!signals.hasDueDate) return 'allowance';
  return 'payment';
}

export function itemKindOf(item: { itemKind?: ItemKind | null }, signals: KindInference): ItemKind | null {
  // Income comes in; a transfer moves money between your own wallets.
  // Neither is a way of spending, whatever an older version stored.
  if (signals.flow === 'Income' || signals.flow === 'Transfer') return null;
  return item.itemKind ?? inferItemKind(signals);
}

export function incomeModeOf(item: { incomeMode?: IncomeMode | null }): IncomeMode {
  return item.incomeMode ?? 'lump_sum';
}

// ---- Month position ----

/** How far through `month` today is: 0 before it, 1 after it. */
export function monthPosition(month: string, today: Date): { daysInMonth: number; elapsed: number; daysLeft: number; phase: 'past' | 'current' | 'future' } {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const key = today.getFullYear() * 12 + today.getMonth();
  const target = y * 12 + (m - 1);
  if (key > target) return { daysInMonth, elapsed: daysInMonth, daysLeft: 0, phase: 'past' };
  if (key < target) return { daysInMonth, elapsed: 0, daysLeft: daysInMonth, phase: 'future' };
  // Today counts as a day still to spend in.
  return { daysInMonth, elapsed: today.getDate(), daysLeft: daysInMonth - today.getDate() + 1, phase: 'current' };
}

// ---- Payments ----

export type PaymentState = 'Paid' | 'Due' | 'Overdue';

export interface PaymentProgress {
  paid: number;
  planned: number;
  /** Still to pay this month. */
  remaining: number;
  /** What should have been paid by today (occurrences already due). */
  dueByToday: number;
  state: PaymentState;
  /** The next unpaid due date, if any. */
  nextDue: Date | null;
  /** "40,000 of 160,000 paid", or null before anything is paid. */
  partLine: string | null;
}

/**
 * A payment's month: settled once fully paid; overdue while what's been
 * paid is short of the occurrences already due (a weekly payment is
 * overdue only for the weeks that have passed); due otherwise.
 */
export function paymentProgress(entry: ItemMonth, today: Date): PaymentProgress {
  const planned = r2(entry.available);
  const paid = r2(entry.actual);
  const remaining = r2(Math.max(0, planned - paid));
  const day = dayOnly(today);
  const dates = entry.dueDates.length ? entry.dueDates : entry.due ? [entry.due] : [];
  const unit = dates.length ? planned / dates.length : planned;
  const passed = dates.filter((d) => dayOnly(d) < day).length;
  const dueByToday = r2(unit * passed);
  const settled = entry.closed || (planned > 0 && paid >= planned - 0.5);
  const state: PaymentState = settled ? 'Paid' : passed > 0 && paid < dueByToday - 0.5 ? 'Overdue' : 'Due';
  // The first occurrence the money paid so far doesn't cover.
  const coveredCount = unit > 0 ? Math.floor((paid + 0.5) / unit) : dates.length;
  const nextDue = settled ? null : (dates[Math.min(coveredCount, dates.length - 1)] ?? null);
  return {
    paid,
    planned,
    remaining,
    dueByToday,
    state,
    nextDue,
    partLine: paid > 0 && !settled ? `${fmt(paid)} of ${fmt(planned)} paid` : null,
  };
}

// ---- Allowances ----

export interface AllowancePace {
  spent: number;
  left: number;
  daysLeft: number;
  /** Left per remaining day (0 when nothing is left or the month is over). */
  perDay: number;
  /** Not released yet: the day it becomes available. */
  availableFrom: Date | null;
  over: boolean;
  /** "6,000 a day left for 21 days", "Available from 15 Oct", "Over by 4,000". */
  paceLine: string;
}

export function allowancePace(entry: ItemMonth, today: Date): AllowancePace {
  const spent = r2(entry.actual);
  const left = r2(entry.available - entry.actual);
  const { daysLeft, phase } = monthPosition(entry.month, today);
  const notYet = entry.availableFrom && dayOnly(entry.availableFrom) > dayOnly(today) ? entry.availableFrom : null;
  const perDay = left > 0 && daysLeft > 0 ? r2(left / daysLeft) : 0;
  let paceLine: string;
  if (left < -0.5) paceLine = `Over by ${fmt(-left)}`;
  else if (notYet) paceLine = `Available from ${dayMonth(notYet)}`;
  else if (phase === 'past') paceLine = left > 0.5 ? `${fmt(left)} unused` : 'All used';
  else if (left <= 0.5) paceLine = 'All used';
  else if (phase === 'future') paceLine = `${fmt(left)} for the month`;
  else paceLine = `${fmt(perDay)} a day left for ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
  return { spent, left, daysLeft, perDay, availableFrom: notYet, over: left < -0.5, paceLine };
}

/** "22,000 left · about 1,000 a day" — the allowance row's one line. */
export function allowanceLine(entry: ItemMonth, today: Date): string {
  const pace = allowancePace(entry, today);
  if (pace.over || pace.availableFrom || pace.left <= 0.5) return pace.paceLine;
  return pace.perDay > 0 ? `${fmt(pace.left)} left · about ${fmt(pace.perDay)} a day` : `${fmt(pace.left)} left`;
}

// ---- Set asides ----

export interface SetAsideProgress {
  /** Everything put away so far (this month and every month before), net of what was used. */
  saved: number;
  /** Put away in total, before anything was used. */
  contributed: number;
  /** Spent from it (or withdrawn), in total. */
  used: number;
  /** Put away this month. */
  thisMonth: number;
  target: number | null;
  targetDate: Date | null;
  /** "Saved 27,000 of 120,000 · by Dec" */
  line: string;
  /** "Used 30,000 of the 120,000 set aside", when anything was used. */
  usedLine: string | null;
}

export function setAsideProgress(entry: ItemMonth): SetAsideProgress {
  const history = entry.setAside ?? { target: null, targetDate: null, savedBefore: 0, usedBefore: 0 };
  const contributed = r2(history.savedBefore + entry.actual);
  const used = r2(history.usedBefore + entry.withdrawn);
  const saved = r2(contributed - used);
  const target = history.target && history.target > 0 ? history.target : null;
  const by = history.targetDate ? ` · by ${SHORT[history.targetDate.getMonth()]}` : '';
  const line = target ? `Saved ${fmt(saved)} of ${fmt(target)}${by}` : `Saved ${fmt(saved)}${by}`;
  return {
    saved,
    contributed,
    used,
    thisMonth: r2(entry.actual),
    target,
    targetDate: history.targetDate,
    line,
    usedLine: used > 0 ? `Used ${fmt(used)} of the ${fmt(contributed)} set aside` : null,
  };
}

// ---- Income ----

export interface IncomePace {
  received: number;
  expected: number;
  /** Trickle: what should have come in by today at an even pace. */
  expectedByToday: number;
  behind: boolean;
  /** "62,000 received, 70,000 expected by today", or "Received 25,000 of 100,000". */
  paceLine: string;
}

export function incomePace(entry: ItemMonth, today: Date): IncomePace {
  const received = r2(entry.actual);
  const expected = r2(entry.available);
  if (entry.incomeMode !== 'trickle') {
    return { received, expected, expectedByToday: expected, behind: false, paceLine: `Received ${fmt(received)} of ${fmt(expected)}` };
  }
  const { daysInMonth, elapsed, phase } = monthPosition(entry.month, today);
  const expectedByToday = r2(phase === 'past' ? expected : phase === 'future' ? 0 : (expected * elapsed) / daysInMonth);
  const paceLine =
    phase === 'future' ? `${fmt(expected)} expected over the month` : `${fmt(received)} received, ${fmt(expectedByToday)} expected by ${phase === 'past' ? 'month end' : 'today'}`;
  return { received, expected, expectedByToday, behind: received < expectedByToday - 0.5, paceLine };
}

// ---- One item's row ----

export interface ItemRowView {
  kind: ItemKind | 'income' | 'move';
  /** The one grey line under the name. */
  line: string;
  /** The right-hand figure: used / planned. */
  used: number;
  planned: number;
  /** A real problem: overdue or over plan. */
  problem: boolean;
  /** Payments only: what "Pay" records by default. */
  payable: number;
}

/** "Moved 50,000 of 100,000 · fee 500", or "Not moved yet". */
export function moveLine(entry: ItemMonth): string {
  const moved = entry.actual >= entry.available - 0.5 && entry.available > 0 ? 'Moved' : entry.actual > 0 ? `Moved ${fmt(entry.actual)} of ${fmt(entry.available)}` : 'Not moved yet';
  return entry.fee > 0 ? `${moved} · fee ${fmt(entry.fee)}` : moved;
}

export function itemRowView(entry: ItemMonth, today: Date): ItemRowView {
  if (entry.type === 'Transfer') {
    return { kind: 'move', line: moveLine(entry), used: r2(entry.actual), planned: r2(entry.available), problem: false, payable: 0 };
  }
  if (entry.type === 'Income') {
    const pace = incomePace(entry, today);
    const line =
      entry.incomeMode === 'trickle'
        ? pace.paceLine
        : entry.due
          ? `${dayMonth(entry.due)} · ${pace.received >= pace.expected - 0.5 && pace.expected > 0 ? 'Received' : pace.received > 0 ? 'Partly received' : dayOnly(entry.due) < dayOnly(today) ? 'Late' : 'Expected'}`
          : 'Expected';
    return { kind: 'income', line, used: pace.received, planned: pace.expected, problem: false, payable: 0 };
  }
  if (entry.itemKind === 'allowance') {
    const pace = allowancePace(entry, today);
    return { kind: 'allowance', line: allowanceLine(entry, today), used: pace.spent, planned: r2(entry.available), problem: pace.over, payable: 0 };
  }
  if (entry.itemKind === 'set_aside') {
    const progress = setAsideProgress(entry);
    return { kind: 'set_aside', line: progress.line, used: progress.thisMonth, planned: r2(entry.available), problem: false, payable: r2(Math.max(0, entry.available - entry.actual)) };
  }
  const payment = paymentProgress(entry, today);
  const date = payment.nextDue ?? entry.dueDates[entry.dueDates.length - 1] ?? entry.due;
  const line = [date ? dayMonth(date) : null, payment.partLine ?? payment.state].filter(Boolean).join(' · ');
  return { kind: 'payment', line, used: payment.paid, planned: payment.planned, problem: payment.state === 'Overdue', payable: payment.remaining };
}

// ---- A basket in a month ----

export interface BasketMonthView {
  planned: number;
  used: number;
  left: number;
  /** The kind most of its planned money is in. */
  mainKind: ItemKind | 'income' | 'move';
  /** "8 of 9 paid", "61,560 left", "Saved 27,000 of 120,000". */
  line: string;
  /** A real problem number on the row (overdue or over plan). */
  problem: boolean;
  overdueCount: number;
  overdueAmount: number;
}

/**
 * One basket's month: Planned (its items' occurrences), Used (paid + spent
 * + set aside) and Left, with the one line its row shows, picked by the
 * kind holding most of its money.
 */
export function basketMonthView(group: Pick<BucketGroup, 'items'>, today: Date): BasketMonthView {
  const items = group.items.filter((entry) => !entry.archived || entry.actual !== 0);
  const spending = items.filter((entry) => entry.type !== 'Income');
  const counted = spending.length ? spending : items;
  const planned = r2(counted.reduce((s, e) => s + e.available, 0));
  const used = r2(counted.reduce((s, e) => s + e.actual, 0));
  const left = r2(planned - used);
  const byKind = new Map<ItemKind | 'income' | 'move', number>();
  for (const entry of counted) {
    const kind = entry.type === 'Income' ? 'income' : entry.type === 'Transfer' ? 'move' : (entry.itemKind ?? 'payment');
    byKind.set(kind, (byKind.get(kind) ?? 0) + Math.max(0, entry.available) + 0.001);
  }
  const mainKind = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'payment';
  const payments = counted.filter((e) => e.type !== 'Income' && e.type !== 'Transfer' && (e.itemKind ?? 'payment') === 'payment');
  const progress = payments.map((e) => ({ entry: e, p: paymentProgress(e, today) }));
  const overdue = progress.filter((x) => x.p.state === 'Overdue');
  const overPlan = spending.some((e) => e.itemKind === 'allowance' && e.actual > e.available + 0.5) || (spending.length > 0 && left < -0.5);
  let line: string;
  if (mainKind === 'move') {
    const moves = counted.filter((e) => e.type === 'Transfer');
    const done = moves.filter((e) => e.available > 0 && e.actual >= e.available - 0.5).length;
    const fees = moves.reduce((s, e) => s + e.fee, 0);
    line = `${done} of ${moves.length} moved${fees > 0 ? ` · fees ${fmt(fees)}` : ''}`;
  } else if (mainKind === 'income') {
    const received = items.reduce((s, e) => s + e.actual, 0);
    line = received >= planned - 0.5 && planned > 0 ? 'All received' : `${fmt(Math.max(0, planned - received))} still expected`;
  } else if (mainKind === 'payment') {
    const paid = progress.filter((x) => x.p.state === 'Paid').length;
    line = overdue.length ? `${overdue.length} overdue · ${paid} of ${payments.length} paid` : `${paid} of ${payments.length} paid`;
  } else if (mainKind === 'allowance') {
    line = left < -0.5 ? `Over by ${fmt(-left)}` : `${fmt(left)} left`;
  } else {
    const asides = counted.filter((e) => e.itemKind === 'set_aside').map(setAsideProgress);
    const saved = asides.reduce((s, a) => s + a.saved, 0);
    const target = asides.reduce((s, a) => s + (a.target ?? 0), 0);
    line = target > 0 ? `Saved ${fmt(saved)} of ${fmt(target)}` : `Saved ${fmt(saved)}`;
  }
  return {
    planned,
    used,
    left,
    mainKind,
    line,
    problem: overdue.length > 0 || overPlan,
    overdueCount: overdue.length,
    overdueAmount: r2(overdue.reduce((s, x) => s + Math.max(0, x.p.dueByToday - x.p.paid), 0)),
  };
}

// ---- Recording against an item (Add expense, Add received, Pay) ----

export interface RecordHint {
  /** "Leisure · Hangouts: 22,000 left of 30,000" */
  helper: string;
  /** Payments only: the full amount still due, offered as a chip, never filled in. */
  payFull: number | null;
  /** "Hangouts will have 12,000 left." for a typed amount. */
  impact: (amount: number) => string | null;
}

export function recordHint(entry: ItemMonth, bucketName: string): RecordHint {
  const left = r2(entry.available - entry.actual);
  const name = `${bucketName} · ${entry.name}`;
  if (entry.type === 'Income') {
    return {
      helper: `${name}: ${fmt(entry.actual)} received of ${fmt(entry.available)}`,
      payFull: null,
      impact: (amount) => (amount > 0 ? `${entry.name} will have ${fmt(entry.actual + amount)} received of ${fmt(entry.available)}.` : null),
    };
  }
  if (entry.type === 'Transfer') {
    return {
      helper: `${name}: ${moveLine(entry)}`,
      payFull: null,
      impact: (amount) => (amount > 0 ? `Moves ${fmt(amount)} between your wallets${entry.fee > 0 ? `; only the fee is spending` : ''}.` : null),
    };
  }
  if (entry.itemKind === 'set_aside') {
    const progress = setAsideProgress(entry);
    return {
      helper: `${name}: ${progress.line}`,
      payFull: null,
      impact: (amount) => (amount > 0 ? `${entry.name} will have ${fmt(progress.saved + amount)} saved${progress.target ? ` of ${fmt(progress.target)}` : ''}.` : null),
    };
  }
  return {
    helper: `${name}: ${left < 0 ? `over by ${fmt(-left)}` : `${fmt(left)} left`} of ${fmt(entry.available)}`,
    payFull: entry.itemKind === 'payment' || entry.itemKind == null ? (left > 0.5 ? left : null) : null,
    impact: (amount) => {
      if (!(amount > 0)) return null;
      const after = r2(left - amount);
      return after < 0 ? `${entry.name} will be over by ${fmt(-after)}.` : `${entry.name} will have ${fmt(after)} left.`;
    },
  };
}

/**
 * What picking a basket item fills in on Add expense (or Add received, or
 * a set aside contribution): its category, a description, and its usual
 * accounts. Never the amount: that's what was actually spent or received,
 * typed by the user. A payment's full due amount is offered separately
 * (recordHint's payFull) and only filled in when tapped.
 */
export function basketItemFormFields(item: {
  bucketName: string;
  name: string;
  categoryId: string;
  accountId: string | null;
  toAccountId: string | null;
  charges: number | null;
  isTransfer: boolean;
}): { category: string; description: string; fromAccountId?: string; toAccountId?: string; charges?: string } {
  return {
    category: item.categoryId,
    description: `${item.bucketName}: ${item.name}`,
    ...(item.accountId ? { fromAccountId: item.accountId } : {}),
    ...(item.toAccountId ? { toAccountId: item.toAccountId } : {}),
    ...(item.isTransfer && item.charges != null ? { charges: String(item.charges) } : {}),
  };
}
