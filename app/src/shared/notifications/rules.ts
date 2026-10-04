// The notification rules: facts about money and time in, the notifications
// that should exist out. Similar situations batch into one notification
// with an item list ("8 payments are overdue · 342,500 XAF") under a group
// key; each item keeps its own key (type + entity + period), so the same
// situation never makes a second notification. The runner
// (src/widgets/Notifications/NotificationsRunner.tsx) gathers the facts
// from the existing pure modules; this file only decides. Pure, tested in
// test/notifications.test.ts. No long dashes in any of the words.

import {
  MODULE_OF,
  type NotificationAction,
  type NotificationDraft,
  type NotificationItem,
  type NotificationSeverity,
  type NotificationType,
} from './types';

// ---------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------

export interface FactLine {
  key: string;
  bucketId: string;
  itemId: string;
  name: string;
  type: 'Expense' | 'Savings' | 'Income' | 'Transfer';
  /** The line's status in its own words (monthTotals.ts's LineStatus). */
  state: string;
  /** Still to pay, save or receive. */
  left: number;
  due: Date | null;
  necessity: 'MustHave' | 'NiceToHave' | null;
  closed: boolean;
}

export interface ForecastFacts {
  cushion: number;
  /** From the applied plan, never the draft. */
  breaches: { month: string; lowest: number; date: Date; belowZero: boolean }[];
  shortMonths: { month: string; shortfall: number }[];
  /** Backlog items the daily Auto-allocate run found room for. */
  autoAllocate: { count: number; names: string[] };
  /** Want to buy items waiting 30 days or more that now fit without touching the cushion. */
  wantToBuyFits: { id: string; name: string; month: string; amount: number }[];
  /** Consecutive past months at or above the cushion. */
  streak: number;
}

export interface MoneyFacts {
  currency: string;
  /** yyyy-MM */
  month: string;
  lines: FactLine[];
  overspends: { key: string; bucketId: string; itemId: string; name: string; amount: number }[];
  leftovers: { bucketId: string; name: string; amount: number }[];
  mustHaves: { status: 'covered' | 'waiting' | 'short'; count: number; due: number; short: number; waitingFor: string[] } | null;
  readyToPay: { id: string; name: string; amount: number }[];
  incomeReceived: { key: string; name: string; amount: number; readyCount: number }[];
  monthReview: { month: string; text: string } | null;
  unassigned: { id: string; label: string; amount: number; date: Date }[];
  reconcile: { accountId: string; name: string; difference: number }[];
  debts: { id: string; name: string; amount: number; due: Date }[];
  savingsBehind: { key: string; bucketId: string; name: string; short: number }[];
  pace: { status: 'on_track' | 'watch' | 'off_track'; message: string } | null;
  forecast: ForecastFacts | null;
}

export interface TimeFacts {
  overdueTasks: { id: string; title: string; due: Date; doFirst: boolean }[];
  /** More than this many overdue (or any in Do first) is urgent. */
  overdueUrgentCount: number;
  dueToday: { id: string; title: string; due: Date }[];
  projects: { id: string; name: string; risk: 'at risk' | 'overdue'; reason: string }[];
  milestones: { id: string; projectId: string; name: string; state: 'missed' | 'at risk' }[];
  days: { key: string; date: Date; label: string; scheduledMinutes: number; capacityMinutes: number }[];
  /** Do first share of scheduled time this week, over the limit. */
  doFirstHeavy: { share: number } | null;
  conflicts: { taskId: string; title: string; eventTitle: string; date: Date }[];
  streakBroken: { days: number } | null;
  /** Written by the runner inside the morning or evening window. */
  morning: { day: string; title: string; body: string } | null;
  evening: { day: string; title: string; body: string } | null;
}

export interface SystemFacts {
  syncProblems: { key: string; message: string }[];
}

export interface NotificationFacts {
  now: Date;
  money: MoneyFacts | null;
  time: TimeFacts | null;
  system: SystemFacts | null;
}

// ---------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
const lineRoute = (l: { bucketId: string; itemId: string }, month: string) => `/budget/item/${l.bucketId}/${l.itemId}?month=${month}`;

function make(
  type: NotificationType,
  severity: NotificationSeverity,
  groupKey: string,
  title: string,
  body: string,
  items: NotificationItem[],
  primaryAction: NotificationAction | null,
  secondaryActions: NotificationAction[] = [],
  expiresAt: Date | null = null
): NotificationDraft {
  return { type, module: MODULE_OF[type], severity, dedupeKey: groupKey, groupKey, title, body, items, primaryAction, secondaryActions, expiresAt };
}

const sum = (xs: { amount: number | null }[]) => xs.reduce((s, x) => s + (x.amount ?? 0), 0);

// ---------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------

function moneyRules(m: MoneyFacts, now: Date): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const c = m.currency;
  const month = m.month;
  const today = startOfDay(now);
  const amountText = (n: number) => `${fmt(n)} ${c}`;

  // Payments overdue (bills and savings past their date).
  const overdue = m.lines.filter((l) => (l.type === 'Expense' || l.type === 'Savings' || l.type === 'Transfer') && l.state === 'Overdue' && !l.closed && l.left > 0);
  if (overdue.length) {
    const items: NotificationItem[] = overdue.map((l) => ({
      key: `payment_overdue:${l.key}`,
      entityType: 'line',
      entityId: l.key,
      label: l.name,
      amount: l.left,
      date: l.due,
      action: { label: 'Mark paid', handler: 'markPaid', params: { bucketId: l.bucketId, itemId: l.itemId, month } },
    }));
    const total = sum(items);
    out.push(
      make(
        'payment_overdue',
        'urgent',
        `payment_overdue:${month}`,
        overdue.length === 1 ? `${overdue[0].name} is overdue · ${amountText(total)}` : `${overdue.length} payments are overdue · ${amountText(total)}`,
        overdue.length === 1 ? `It was due ${overdue[0].due ? short(overdue[0].due) : 'earlier this month'}.` : `The oldest was due ${short(overdue.map((l) => l.due ?? today).sort((a, b) => a.getTime() - b.getTime())[0])}.`,
        items,
        overdue.length === 1 ? items[0].action : { label: 'Review', route: `/payments?month=${month}` },
        [{ label: 'Open payments', route: `/payments?month=${month}` }]
      )
    );
  }

  // Due today or in the next 3 days.
  const soon = m.lines.filter((l) => {
    if (l.type === 'Income' || l.closed || l.left <= 0 || !l.due || l.state === 'Overdue') return false;
    const d = daysBetween(today, l.due);
    return d >= 0 && d <= 3;
  });
  if (soon.length) {
    const items: NotificationItem[] = soon.map((l) => ({
      key: `payment_due_soon:${l.key}`,
      entityType: 'line',
      entityId: l.key,
      label: l.name,
      amount: l.left,
      date: l.due,
      action: { label: 'Mark paid', handler: 'markPaid', params: { bucketId: l.bucketId, itemId: l.itemId, month } },
    }));
    const dueToday = soon.filter((l) => daysBetween(today, l.due!) === 0).length;
    out.push(
      make(
        'payment_due_soon',
        dueToday ? 'warning' : 'info',
        `payment_due_soon:${dayKeyOf(today)}`,
        soon.length === 1
          ? `${soon[0].name} is due ${daysBetween(today, soon[0].due!) === 0 ? 'today' : `on ${short(soon[0].due!)}`} · ${amountText(soon[0].left)}`
          : `${soon.length} payments due in the next 3 days · ${amountText(sum(items))}`,
        dueToday ? `${dueToday} ${plural(dueToday, 'is', 'are')} due today.` : 'Nothing is due today.',
        items,
        soon.length === 1 ? items[0].action : { label: 'Review', route: `/payments?month=${month}` }
      )
    );
  }

  // Overspend not yet covered or justified.
  if (m.overspends.length) {
    const items: NotificationItem[] = m.overspends.map((o) => ({
      key: `overspend_uncovered:${o.key}`,
      entityType: 'line',
      entityId: o.key,
      label: o.name,
      amount: o.amount,
      date: null,
      action: { label: 'Cover or justify', route: `/budget/cover?month=${month}&bucket=${o.bucketId}&item=${o.itemId}` },
    }));
    out.push(
      make(
        'overspend_uncovered',
        'warning',
        `overspend_uncovered:${month}`,
        m.overspends.length === 1 ? `${m.overspends[0].name} is over plan by ${amountText(m.overspends[0].amount)}` : `${m.overspends.length} lines are over plan · ${amountText(sum(items))}`,
        'Cover it from another line or explain why, so the month stays honest.',
        items,
        m.overspends.length === 1 ? items[0].action : { label: 'Cover or justify', route: `/budget/cover?month=${month}` }
      )
    );
  }

  // Leftover money to reallocate.
  if (m.leftovers.length) {
    const items: NotificationItem[] = m.leftovers.map((l) => ({
      key: `leftover_to_reallocate:${l.bucketId}:${month}`,
      entityType: 'line',
      entityId: l.bucketId,
      label: l.name,
      amount: l.amount,
      date: null,
      action: { label: 'Reallocate', route: `/budget/reallocate?month=${month}&bucket=${l.bucketId}` },
    }));
    out.push(
      make(
        'leftover_to_reallocate',
        'info',
        `leftover_to_reallocate:${month}`,
        `${amountText(sum(items))} left over in ${m.leftovers.length} ${plural(m.leftovers.length, 'basket', 'baskets')}`,
        'Move it where it’s needed, or into savings.',
        items,
        items.length === 1 ? items[0].action : { label: 'Reallocate', route: `/budget/reallocate?month=${month}` }
      )
    );
  }

  // Must-haves short or waiting for income.
  if (m.mustHaves && m.mustHaves.status !== 'covered') {
    const mh = m.mustHaves;
    const isShort = mh.status === 'short';
    out.push(
      make(
        'must_haves_short',
        isShort ? 'urgent' : 'warning',
        `must_haves_short:${month}`,
        isShort ? `Must-haves are short by ${amountText(mh.short)}` : `${mh.count} ${plural(mh.count, 'must-have waits', 'must-haves wait')} for income`,
        isShort
          ? `${amountText(mh.due)} of must-haves is still due this month and the money expected won't cover it.`
          : `They can be paid once ${mh.waitingFor.slice(0, 2).join(' and ') || 'income'} ${mh.waitingFor.length > 1 ? 'arrive' : 'arrives'}.`,
        [],
        { label: 'Review', route: `/budget?month=${month}` }
      )
    );
  }

  // Expected income that's late.
  const late = m.lines.filter((l) => l.type === 'Income' && l.state === 'Late' && !l.closed);
  if (late.length) {
    const items: NotificationItem[] = late.map((l) => ({
      key: `income_late:${l.key}`,
      entityType: 'line',
      entityId: l.key,
      label: l.name,
      amount: l.left,
      date: l.due,
      action: { label: 'Record it', route: lineRoute(l, month) },
    }));
    out.push(
      make(
        'income_late',
        'warning',
        `income_late:${month}`,
        late.length === 1 ? `${late[0].name} hasn't arrived yet` : `${late.length} incomes haven't arrived yet · ${amountText(sum(items))}`,
        late.length === 1 ? `It was expected ${late[0].due ? `on ${short(late[0].due)}` : 'earlier'}. Record it when it comes in.` : 'Record each one when it comes in.',
        items,
        late.length === 1 ? items[0].action : { label: 'Review', route: `/budget?month=${month}` }
      )
    );
  }

  // Income received, with what's now ready to pay (a message: kept 3 days).
  for (const r of m.incomeReceived) {
    out.push(
      make(
        'income_received',
        'positive',
        `income_received:${r.key}`,
        `${r.name} arrived · ${amountText(r.amount)}`,
        r.readyCount ? `${r.readyCount} ${plural(r.readyCount, 'payment is', 'payments are')} ready to pay.` : 'Nothing was waiting on it.',
        [],
        r.readyCount ? { label: 'Ready to pay', route: '/budget/ready' } : null,
        [],
        addDays(endOfDay(now), 3)
      )
    );
  }

  // Ready to pay items waiting for confirmation.
  if (m.readyToPay.length) {
    const items: NotificationItem[] = m.readyToPay.map((q) => ({
      key: `ready_to_pay:${q.id}`,
      entityType: 'queue',
      entityId: q.id,
      label: q.name,
      amount: q.amount,
      date: null,
      action: null,
    }));
    out.push(
      make(
        'ready_to_pay',
        'info',
        `ready_to_pay:${month}`,
        `${items.length} ${plural(items.length, 'payment is', 'payments are')} ready to confirm · ${amountText(sum(items))}`,
        'Prepared from your automation. Confirm each one once it’s paid.',
        items,
        { label: 'Review', route: '/budget/ready' }
      )
    );
  }

  // New month set up, waiting for review.
  if (m.monthReview) {
    out.push(
      make('month_review', 'info', `month_review:${m.monthReview.month}`, `${monthName(m.monthReview.month)} is set up`, m.monthReview.text, [], {
        label: 'Review',
        route: `/budget/review?month=${m.monthReview.month}`,
      })
    );
  }

  // Transactions not assigned to a bucket.
  if (m.unassigned.length) {
    const items: NotificationItem[] = m.unassigned.map((t) => ({
      key: `unassigned_transactions:${t.id}`,
      entityType: 'transaction',
      entityId: t.id,
      label: t.label,
      amount: t.amount,
      date: t.date,
      action: { label: 'Assign', route: `/transactions/${t.id}` },
    }));
    out.push(
      make(
        'unassigned_transactions',
        'info',
        `unassigned_transactions:${month}`,
        `${items.length} ${plural(items.length, 'expense has', 'expenses have')} no basket · ${amountText(sum(items))}`,
        'Assign them so this month’s plan is complete.',
        items,
        { label: 'Review', route: `/transactions?month=${month}` }
      )
    );
  }

  // Balances not matching recorded transactions.
  if (m.reconcile.length) {
    const items: NotificationItem[] = m.reconcile.map((a) => ({
      key: `reconcile_mismatch:${a.accountId}`,
      entityType: 'account',
      entityId: a.accountId,
      label: a.name,
      amount: a.difference,
      date: null,
      action: null,
    }));
    out.push(
      make(
        'reconcile_mismatch',
        'warning',
        'reconcile_mismatch',
        `${items.length} ${plural(items.length, 'balance doesn’t', 'balances don’t')} match the transactions`,
        'The stored balance and the sum of recorded transactions differ.',
        items,
        { label: 'Reconcile', route: '/settings/reconcile' }
      )
    );
  }

  // Debt payments due (next 3 days) or late.
  const debtsLate = m.debts.filter((d) => startOfDay(d.due) < today);
  const debtsDue = m.debts.filter((d) => {
    const days = daysBetween(today, d.due);
    return days >= 0 && days <= 3;
  });
  const debtItems = (list: typeof m.debts, kind: string): NotificationItem[] =>
    list.map((d) => ({
      key: `${kind}:${d.id}:${dayKeyOf(d.due)}`,
      entityType: 'debt',
      entityId: d.id,
      label: d.name,
      amount: d.amount,
      date: d.due,
      action: { label: 'Record payment', route: `/debts/${d.id}/repay?amount=${Math.round(d.amount)}` },
    }));
  if (debtsLate.length) {
    const items = debtItems(debtsLate, 'debt_payment_late');
    out.push(
      make(
        'debt_payment_late',
        'urgent',
        'debt_payment_late',
        debtsLate.length === 1
          ? `${debtsLate[0].name}: ${amountText(debtsLate[0].amount)} is ${daysBetween(debtsLate[0].due, today)} ${plural(daysBetween(debtsLate[0].due, today), 'day', 'days')} late`
          : `${debtsLate.length} debt payments are late · ${amountText(sum(items))}`,
        'Record the payment once it’s made, or change the payment plan.',
        items,
        debtsLate.length === 1 ? items[0].action : { label: 'Open debts', route: '/debts' }
      )
    );
  }
  if (debtsDue.length) {
    const items = debtItems(debtsDue, 'debt_payment_due');
    out.push(
      make(
        'debt_payment_due',
        'warning',
        `debt_payment_due:${dayKeyOf(today)}`,
        debtsDue.length === 1 ? `${debtsDue[0].name}: ${amountText(debtsDue[0].amount)} due ${daysBetween(today, debtsDue[0].due) === 0 ? 'today' : `on ${short(debtsDue[0].due)}`}` : `${debtsDue.length} debt payments due soon · ${amountText(sum(items))}`,
        'From your payment plan.',
        items,
        debtsDue.length === 1 ? items[0].action : { label: 'Open debts', route: '/debts' }
      )
    );
  }

  // Savings behind plan.
  if (m.savingsBehind.length) {
    const items: NotificationItem[] = m.savingsBehind.map((s) => ({
      key: `savings_behind:${s.key}`,
      entityType: 'line',
      entityId: s.key,
      label: s.name,
      amount: s.short,
      date: null,
      action: { label: 'Open', route: `/budget/basket/${s.bucketId}?month=${month}` },
    }));
    out.push(
      make(
        'savings_behind',
        'warning',
        `savings_behind:${month}`,
        items.length === 1 ? `${items[0].label} is ${amountText(items[0].amount ?? 0)} behind this month` : `${items.length} savings are behind plan · ${amountText(sum(items))}`,
        'What was planned to set aside this month hasn’t been saved yet.',
        items,
        items.length === 1 ? items[0].action : { label: 'Review', route: `/budget?month=${month}` }
      )
    );
  }

  // Flexible spending off pace (once a day).
  if (m.pace && m.pace.status === 'off_track') {
    out.push(
      make('spending_off_pace', 'warning', `spending_off_pace:${dayKeyOf(today)}`, 'Day-to-day spending is off pace', m.pace.message, [], {
        label: 'See the daily guide',
        route: '/baskets/forecast',
      })
    );
  }

  if (m.forecast) out.push(...forecastRules(m.forecast, c, now));
  return out;
}

function forecastRules(f: ForecastFacts, c: string, now: Date): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const amountText = (n: number) => `${fmt(n)} ${c}`;
  const zero = f.breaches.filter((b) => b.belowZero);
  const cushion = f.breaches.filter((b) => !b.belowZero);
  const breachItems = (list: typeof f.breaches, type: string): NotificationItem[] =>
    list.map((b) => ({ key: `${type}:${b.month}`, entityType: 'month', entityId: b.month, label: monthName(b.month), amount: b.lowest, date: b.date, action: { label: 'Open plan', route: `/baskets/forecast?month=${b.month}` } }));
  if (zero.length) {
    out.push(
      make(
        'forecast_below_zero',
        'urgent',
        'forecast_below_zero',
        zero.length === 1 ? `${monthName(zero[0].month)} drops below zero` : `${zero.length} months drop below zero`,
        `Your balance reaches ${amountText(zero[0].lowest)} on ${short(zero[0].date)}. Move or split something before then.`,
        breachItems(zero, 'forecast_below_zero'),
        { label: 'Open plan', route: '/baskets/forecast' }
      )
    );
  }
  if (cushion.length) {
    out.push(
      make(
        'forecast_below_cushion',
        'warning',
        'forecast_below_cushion',
        cushion.length === 1 ? `${monthName(cushion[0].month)} drops below your cushion` : `${cushion.length} months drop below your cushion`,
        `The lowest point is ${amountText(cushion[0].lowest)} on ${short(cushion[0].date)}, under your ${amountText(f.cushion)} cushion.`,
        breachItems(cushion, 'forecast_below_cushion'),
        { label: 'Open plan', route: '/baskets/forecast' }
      )
    );
  }
  if (f.shortMonths.length) {
    out.push(
      make(
        'forecast_month_short',
        'warning',
        'forecast_month_short',
        f.shortMonths.length === 1 ? `${monthName(f.shortMonths[0].month)} doesn't fit the planned items` : `${f.shortMonths.length} months don't fit the planned items`,
        'More is planned than the income expected in those months.',
        f.shortMonths.map((s) => ({ key: `forecast_month_short:${s.month}`, entityType: 'month', entityId: s.month, label: monthName(s.month), amount: s.shortfall, date: null, action: null })),
        { label: 'Open plan', route: '/baskets/forecast' }
      )
    );
  }
  if (f.autoAllocate.count > 0) {
    out.push(
      make(
        'auto_allocate_ready',
        'info',
        `auto_allocate_ready:${dayKeyOf(now)}`,
        `${f.autoAllocate.count} backlog ${plural(f.autoAllocate.count, 'item now fits', 'items now fit')} your plan`,
        f.autoAllocate.names.slice(0, 3).join(', '),
        [],
        { label: 'See suggestions', route: '/baskets/forecast?allocate=1' }
      )
    );
  }
  for (const w of f.wantToBuyFits) {
    out.push(
      make(
        'want_to_buy_fits',
        'info',
        `want_to_buy_fits:${w.id}`,
        `The ${w.name.toLowerCase()} now fits in ${monthName(w.month)} without touching your cushion`,
        `${amountText(w.amount)}, after waiting at least 30 days.`,
        [],
        { label: 'Open plan', route: '/baskets/forecast' }
      )
    );
  }
  const milestone = [12, 6, 3].find((n) => f.streak >= n && f.streak < n + 1);
  if (milestone) {
    out.push(
      make(
        'cushion_streak',
        'positive',
        `cushion_streak:${milestone}`,
        `${milestone} months above your cushion`,
        `Your balance hasn't dipped under ${amountText(f.cushion)} for ${milestone} months in a row.`,
        [],
        null,
        [],
        addDays(endOfDay(now), 14)
      )
    );
  }
  return out;
}

// ---------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------

function timeRules(t: TimeFacts, now: Date): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const today = dayKeyOf(now);

  if (t.overdueTasks.length) {
    const doFirst = t.overdueTasks.filter((x) => x.doFirst).length;
    const urgent = doFirst > 0 || t.overdueTasks.length > t.overdueUrgentCount;
    const oldest = [...t.overdueTasks].sort((a, b) => a.due.getTime() - b.due.getTime())[0];
    out.push(
      make(
        'tasks_overdue',
        urgent ? 'urgent' : 'warning',
        'tasks_overdue',
        `${t.overdueTasks.length} overdue ${plural(t.overdueTasks.length, 'task', 'tasks')}`,
        doFirst ? `${doFirst} ${plural(doFirst, 'is', 'are')} in Do first. Oldest: ${oldest.title}.` : `Oldest: ${oldest.title}, due ${short(oldest.due)}.`,
        t.overdueTasks.map((x) => ({ key: `tasks_overdue:${x.id}`, entityType: 'task', entityId: x.id, label: x.title, amount: null, date: x.due, action: { label: 'Open', route: `/tasks/${x.id}/edit` } })),
        { label: 'Review', route: '/projects/focus?view=overdue' }
      )
    );
  }
  if (t.dueToday.length) {
    out.push(
      make(
        'tasks_due_today',
        'info',
        `tasks_due_today:${today}`,
        `${t.dueToday.length} ${plural(t.dueToday.length, 'task', 'tasks')} due today`,
        t.dueToday.slice(0, 3).map((x) => x.title).join(', '),
        t.dueToday.map((x) => ({ key: `tasks_due_today:${x.id}`, entityType: 'task', entityId: x.id, label: x.title, amount: null, date: x.due, action: { label: 'Open', route: `/tasks/${x.id}/edit` } })),
        { label: 'Open today', route: '/projects' }
      )
    );
  }
  if (t.projects.length) {
    const late = t.projects.filter((p) => p.risk === 'overdue').length;
    // "7 projects at risk: nothing done lately" when they share a reason.
    const reasons = [...new Set(t.projects.map((p) => p.reason).filter(Boolean))];
    out.push(
      make(
        'projects_at_risk',
        late ? 'urgent' : 'warning',
        'projects_at_risk',
        t.projects.length === 1
          ? `${t.projects[0].name} ${t.projects[0].risk === 'overdue' ? 'is past its deadline' : 'is at risk'}`
          : `${t.projects.length} projects at risk${reasons.length === 1 ? `: ${reasons[0].charAt(0).toLowerCase()}${reasons[0].slice(1)}` : ''}`,
        t.projects.length === 1 ? t.projects[0].reason || 'Open it to see why.' : late ? `${late} ${plural(late, 'is', 'are')} past the deadline.` : 'Open each one to see why.',
        t.projects.map((p) => ({ key: `projects_at_risk:${p.id}`, entityType: 'project', entityId: p.id, label: p.name, amount: null, date: null, action: { label: 'Open', route: `/projects/insights/${p.id}` } })),
        t.projects.length === 1 ? { label: 'Open', route: `/projects/insights/${t.projects[0].id}` } : { label: 'Review', route: '/projects/insights' }
      )
    );
  }
  if (t.milestones.length) {
    const missed = t.milestones.filter((x) => x.state === 'missed').length;
    out.push(
      make(
        'milestones_at_risk',
        missed ? 'urgent' : 'warning',
        'milestones_at_risk',
        t.milestones.length === 1 ? `Milestone ${t.milestones[0].state === 'missed' ? 'missed' : 'at risk'}: ${t.milestones[0].name}` : `${t.milestones.length} milestones need attention`,
        missed ? `${missed} ${plural(missed, 'was', 'were')} missed.` : 'They won’t be reached on time at the current pace.',
        t.milestones.map((x) => ({ key: `milestones_at_risk:${x.id}`, entityType: 'milestone', entityId: x.id, label: x.name, amount: null, date: null, action: { label: 'Open', route: `/projects/insights/${x.projectId}` } })),
        { label: 'Review', route: '/projects/insights' }
      )
    );
  }
  const heavy = t.days.filter((d) => d.scheduledMinutes > d.capacityMinutes);
  if (heavy.length) {
    const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
    out.push(
      make(
        'day_overloaded',
        'warning',
        `day_overloaded:${today}`,
        heavy.length === 1 ? `${heavy[0].label} is overloaded` : `${heavy.length} days this week are overloaded`,
        heavy.length === 1 ? `${hours(heavy[0].scheduledMinutes)} scheduled against ${hours(heavy[0].capacityMinutes)} of capacity.` : 'More is scheduled than your capacity on those days.',
        heavy.map((d) => ({ key: `day_overloaded:${d.key}`, entityType: 'day', entityId: d.key, label: d.label, amount: null, date: d.date, action: { label: 'Open', route: `/projects/calendar?date=${d.key}` } })),
        { label: 'Open calendar', route: `/projects/calendar?date=${heavy[0].key}` }
      )
    );
  }
  if (t.doFirstHeavy) {
    out.push(
      make('do_first_heavy', 'warning', `do_first_heavy:${today}`, `Do first work is ${Math.round(t.doFirstHeavy.share * 100)}% of your time`, 'Schedule important work before it becomes urgent.', [], {
        label: 'Open Focus',
        route: '/projects/focus',
      })
    );
  }
  if (t.conflicts.length) {
    out.push(
      make(
        'calendar_conflict',
        'warning',
        `calendar_conflict:${today}`,
        t.conflicts.length === 1 ? `${t.conflicts[0].title} overlaps ${t.conflicts[0].eventTitle}` : `${t.conflicts.length} tasks overlap Google meetings`,
        'Move the task or change its time.',
        t.conflicts.map((x) => ({ key: `calendar_conflict:${x.taskId}:${dayKeyOf(x.date)}`, entityType: 'task', entityId: x.taskId, label: `${x.title} and ${x.eventTitle}`, amount: null, date: x.date, action: { label: 'Open', route: `/tasks/${x.taskId}/edit` } })),
        { label: 'Open calendar', route: '/projects/calendar' }
      )
    );
  }
  if (t.streakBroken) {
    out.push(
      make('streak_broken', 'info', `streak_broken:${today}`, `Your ${t.streakBroken.days}-day streak ended yesterday`, 'Finish today’s tasks to start a new one.', [], { label: 'Open today', route: '/projects' }, [], endOfDay(now))
    );
  }
  if (t.morning) {
    out.push(make('morning_summary', 'info', `morning_summary:${t.morning.day}`, t.morning.title, t.morning.body, [], { label: 'Open today', route: '/projects' }, [], endOfDay(now)));
  }
  if (t.evening) {
    out.push(make('evening_nudge', 'info', `evening_nudge:${t.evening.day}`, t.evening.title, t.evening.body, [], { label: 'Open today’s list', route: '/tasks?filter=today' }, [], addDays(endOfDay(now), 1)));
  }
  return out;
}

// ---------------------------------------------------------------------
// System
// ---------------------------------------------------------------------

function systemRules(s: SystemFacts): NotificationDraft[] {
  if (!s.syncProblems.length) return [];
  return [
    make(
      'calendar_sync_failed',
      'urgent',
      'calendar_sync_failed',
      'Google Calendar isn’t syncing',
      s.syncProblems[0].message,
      s.syncProblems.map((p) => ({ key: `calendar_sync_failed:${p.key}`, entityType: 'event', entityId: p.key, label: p.message, amount: null, date: null, action: null })),
      { label: 'Fix in Settings', route: '/settings/google-calendar' }
    ),
  ];
}

/** Every notification that should exist now. */
export function evaluateRules(facts: NotificationFacts): NotificationDraft[] {
  return [
    ...(facts.money ? moneyRules(facts.money, facts.now) : []),
    ...(facts.time ? timeRules(facts.time, facts.now) : []),
    ...(facts.system ? systemRules(facts.system) : []),
  ];
}
