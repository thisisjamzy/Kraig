// A debt's repayment schedule: the repeating plan's payments and the
// scheduled one-off repayments (FirestoreScheduledRepayment) together, in
// date order, with the balance owed after each. A scheduled repayment of
// "Everything left" pays the balance left on its date after every earlier
// repayment, planned and made (made ones are already out of the balance
// passed in), so it changes on its own when the balance or the plan does.
// Pure; tested in test/debtSchedule.test.ts.

import { addPlanInterval, nextPayment, type PlanLike } from './debt';

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export interface ScheduledLike {
  id: string;
  date: Date;
  amountMode: 'set' | 'everything';
  amount: number | null;
  /** Already recorded on the debt: out of the balance, not scheduled any more. */
  recorded: boolean;
}

export interface ScheduleEvent {
  key: string;
  kind: 'repeating' | 'scheduled';
  scheduledId: string | null;
  date: Date;
  amount: number;
  everything: boolean;
  /** What's owed after it; below zero when set amounts add up to more than the balance. */
  balanceAfter: number;
}

export interface Schedule {
  events: ScheduleEvent[];
  /** Each scheduled repayment's amount now ("Everything left" resolved). */
  amountOf: Map<string, number>;
  /** How far the scheduled repayments go past what's owed (0 when they don't). */
  overBy: number;
}

/**
 * The schedule from today on. The repeating plan stops once the balance is
 * gone; scheduled repayments always appear (an "Everything left" one after
 * the balance is gone is 0). On the same day, the repeating payment counts
 * first.
 */
export function repaymentSchedule(balance: number, plan: PlanLike | null, scheduled: ScheduledLike[], limit = 600): Schedule {
  const pending = scheduled.filter((s) => !s.recorded).sort((a, b) => dayOf(a.date) - dayOf(b.date) || a.id.localeCompare(b.id));
  const events: ScheduleEvent[] = [];
  const amountOf = new Map<string, number>();
  let left = r2(balance);
  let lowest = left;

  const first = nextPayment(plan);
  let repeatDate: Date | null = plan && first && plan.amount > 0 ? first.date : null;
  let repeatAmount = first?.amount ?? 0;
  let repeatCount = 0;
  let i = 0;

  while ((i < pending.length || (repeatDate && left > 0.005)) && events.length < limit) {
    const s = pending[i];
    const takeRepeat = repeatDate && left > 0.005 && (!s || dayOf(repeatDate) <= dayOf(s.date));
    if (takeRepeat && repeatDate && plan) {
      const amount = r2(Math.min(repeatAmount, left));
      left = r2(left - amount);
      events.push({ key: `repeat:${repeatCount}`, kind: 'repeating', scheduledId: null, date: repeatDate, amount, everything: false, balanceAfter: left });
      repeatCount += 1;
      // After a one-off "next payment" override, the plan resumes on its own date.
      const nextDate: Date = repeatCount === 1 && plan.nextOverride ? plan.nextPaymentDate : addPlanInterval(repeatDate, plan.interval);
      repeatDate = dayOf(nextDate) <= dayOf(repeatDate) ? addPlanInterval(repeatDate, plan.interval) : nextDate;
      repeatAmount = plan.amount;
      continue;
    }
    if (!s) break;
    const everything = s.amountMode === 'everything';
    const amount = everything ? r2(Math.max(0, left)) : r2(Math.max(0, s.amount ?? 0));
    left = r2(left - amount);
    lowest = Math.min(lowest, left);
    amountOf.set(s.id, amount);
    events.push({ key: `scheduled:${s.id}`, kind: 'scheduled', scheduledId: s.id, date: s.date, amount, everything, balanceAfter: left });
    i += 1;
  }
  return { events, amountOf, overBy: r2(Math.max(0, -lowest)) };
}

/** The balance expected just before `date`, leaving out one scheduled repayment (the one being edited). */
export function balanceBefore(balance: number, plan: PlanLike | null, scheduled: ScheduledLike[], date: Date, leaveOut: string | null = null): number {
  const others = scheduled.filter((s) => s.id !== leaveOut);
  const { events } = repaymentSchedule(balance, plan, others);
  let left = balance;
  for (const e of events) {
    if (dayOf(e.date) > dayOf(date) || (e.kind === 'scheduled' && dayOf(e.date) === dayOf(date))) break;
    left = e.balanceAfter;
  }
  return r2(Math.max(0, left));
}

/**
 * The "Plan a repayment" form's Impact card and warnings: "Plans a 250,000
 * repayment on 15 Dec from UBA. Your debt would be fully repaid."
 */
export function scheduledImpact(
  input: { amount: number; date: Date; from: string | null; expected: number; overBy: number; everything: boolean },
  format: (n: number) => string
): { lines: string[]; warnings: string[]; tooMuch: boolean } {
  if (!(input.amount > 0)) {
    return { lines: [input.everything ? 'Nothing will be left to repay on that date.' : 'Enter the amount to see what changes.'], warnings: [], tooMuch: false };
  }
  const day = input.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const after = r2(input.expected - input.amount);
  const lines = [`Plans a ${format(input.amount)} repayment on ${day}${input.from ? ` from ${input.from}` : ''}.`];
  lines.push(after <= 0.005 ? 'Your debt would be fully repaid.' : `You would still owe ${format(after)} after it.`);
  const warnings: string[] = [];
  const tooMuch = !input.everything && input.amount > input.expected + 0.005;
  if (tooMuch) warnings.push(`That's more than the ${format(input.expected)} expected to be owed on ${day}.`);
  if (input.overBy > 0.005) warnings.push(`Your scheduled repayments add up to ${format(input.overBy)} more than what you owe.`);
  return { lines, warnings, tooMuch };
}
