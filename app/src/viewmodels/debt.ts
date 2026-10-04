// The Debt page's sentence. Pure, tested in test/homeDebt.test.ts.

const DAY = 86_400_000;

/**
 * "You owe 3,971,122. The next payment is 50,000 to Momokash on 28 Sep, now 5 days late."
 */
export function debtSentence(
  total: number,
  next: { name: string; amount: number | null; date: Date } | null,
  today: Date,
  format: (n: number) => string
): string {
  if (total <= 0) return 'You have no debt.';
  const first = `You owe ${format(total)}.`;
  if (!next) return `${first} No payment plan is set yet.`;
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(next.date.getFullYear(), next.date.getMonth(), next.date.getDate()).getTime();
  const days = Math.round((due - day) / DAY);
  const when = next.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const what = next.amount ? `${format(next.amount)} to ${next.name}` : `to ${next.name}`;
  const tail = days < 0 ? `, now ${-days} ${days === -1 ? 'day' : 'days'} late` : days === 0 ? ', today' : days === 1 ? ', tomorrow' : '';
  return `${first} The next payment is ${what} on ${when}${tail}.`;
}

// ---------------------------------------------------------------------
// A debt's own page and forms. Pure, tested in test/debtPages.test.ts.
// ---------------------------------------------------------------------

export type PlanInterval = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export const INTERVAL_LABEL: Record<PlanInterval, string> = { weekly: 'week', biweekly: '2 weeks', monthly: 'month', yearly: 'year' };
const INTERVAL_ADVERB: Record<PlanInterval, string> = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', yearly: 'yearly' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function addPlanInterval(date: Date, interval: PlanInterval): Date {
  const d = new Date(date);
  if (interval === 'weekly') d.setDate(d.getDate() + 7);
  else if (interval === 'biweekly') d.setDate(d.getDate() + 14);
  else if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

export interface PlanLike {
  amount: number;
  interval: PlanInterval;
  nextPaymentDate: Date;
  isActive: boolean;
  /** "Only the next payment": a one-off amount and date. */
  nextOverride?: { amount: number; date: Date } | null;
}

/** The next payment due: the one-off override when there is one. */
export function nextPayment(plan: PlanLike | null): { amount: number; date: Date } | null {
  if (!plan || !plan.isActive) return null;
  if (plan.nextOverride) return plan.nextOverride;
  return { amount: plan.amount, date: plan.nextPaymentDate };
}

/** Whole days a date is late (0 when due today or later). */
export function daysLate(date: Date, today: Date): number {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.max(0, Math.round((day - due) / DAY));
}

/**
 * The plan's payments from the next one until the balance is gone: their
 * dates and what's owed after each. Capped so a tiny plan can't run away.
 */
export function projectPayments(balance: number, plan: PlanLike | null, limit = 600): { date: Date; balance: number }[] {
  const next = nextPayment(plan);
  if (!plan || !next || balance <= 0 || !(plan.amount > 0)) return [];
  const out: { date: Date; balance: number }[] = [];
  let left = balance - next.amount;
  out.push({ date: next.date, balance: Math.max(0, left) });
  let date = plan.nextOverride ? plan.nextPaymentDate : addPlanInterval(next.date, plan.interval);
  if (plan.nextOverride && date <= next.date) date = addPlanInterval(next.date, plan.interval);
  while (left > 0.005 && out.length < limit) {
    left -= plan.amount;
    out.push({ date, balance: Math.max(0, left) });
    date = addPlanInterval(date, plan.interval);
  }
  return out;
}

/** "April", or "April 2027" outside the current year. */
export function monthWord(date: Date, today: Date): string {
  return date.getFullYear() === today.getFullYear() ? MONTHS[date.getMonth()] : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The debt page's callout: "200,000 left to repay. The next payment of
 * 50,000 is 5 days late. At this plan it's paid off in April."
 */
export function debtStateSentence(balance: number, plan: PlanLike | null, today: Date, format: (n: number) => string): string {
  if (balance <= 0) return 'Paid off. Nothing left to repay.';
  const parts = [`${format(balance)} left to repay.`];
  const next = nextPayment(plan);
  if (!next) {
    parts.push('No payment plan is set.');
    return parts.join(' ');
  }
  const late = daysLate(next.date, today);
  const due = new Date(next.date.getFullYear(), next.date.getMonth(), next.date.getDate()).getTime();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const when =
    late > 0
      ? `is ${late} ${late === 1 ? 'day' : 'days'} late`
      : due === day
        ? 'is due today'
        : `is due on ${next.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  parts.push(`The next payment of ${format(next.amount)} ${when}.`);
  const payments = projectPayments(balance, plan);
  if (payments.length) parts.push(`At this plan it's paid off in ${monthWord(payments[payments.length - 1].date, today)}.`);
  return parts.join(' ');
}

/** "50,000 monthly, from MTN Mobile Money" */
export function planSentence(plan: PlanLike | null, paidFrom: string | null, format: (n: number) => string): string {
  if (!plan || !plan.isActive) return 'No plan';
  return `${format(plan.amount)} ${INTERVAL_ADVERB[plan.interval]}${paidFrom ? `, from ${paidFrom}` : ''}`;
}

/** The New debt form's Impact card. */
export function newDebtImpact(
  input: { cash: boolean; amount: number; accountName: string | null; borrowedOn: Date },
  today: Date,
  format: (n: number) => string
): { lines: string[]; warnings: string[] } {
  if (!(input.amount > 0)) return { lines: ['Enter the amount to see what changes.'], warnings: [] };
  const owed = `Adds ${format(input.amount)} to what you owe.`;
  if (!input.cash) return { lines: [`${owed} Your balances don't change.`], warnings: [] };
  const month = monthWord(input.borrowedOn, today);
  const lines = [`Adds ${format(input.amount)} to ${input.accountName ?? 'the account'} and counts as ${month} income (borrowed).`, owed];
  const sameMonth = input.borrowedOn.getFullYear() === today.getFullYear() && input.borrowedOn.getMonth() === today.getMonth();
  return { lines, warnings: sameMonth ? [] : [`This adds ${format(input.amount)} to ${month}'s income and changes ${month}'s figures.`] };
}

/** The Record repayment form's Impact card. */
export function repaymentImpact(
  input: { amount: number; balance: number; accountName: string | null },
  format: (n: number) => string
): { lines: string[]; warnings: string[] } {
  if (!(input.amount > 0)) return { lines: ['Enter the amount to see what changes.'], warnings: [] };
  const after = Math.max(0, input.balance - input.amount);
  const owed = after <= 0 ? 'Pays this debt off' : `Reduces what you owe to ${format(after)}`;
  const line = input.accountName ? `${owed} and takes ${format(input.amount)} from ${input.accountName}.` : `${owed}. Your balances don't change.`;
  const warnings = input.amount > input.balance + 0.005 ? [`This is more than the ${format(input.balance)} you owe.`] : [];
  return { lines: [line], warnings };
}
