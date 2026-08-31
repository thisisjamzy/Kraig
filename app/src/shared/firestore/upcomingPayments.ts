// Shared by src/logic/paymentsCalendar and src/logic/home — both need "what
// planned payments are due next", just over different horizons. Client-side
// port of sheets/Code.gs's upcomingBudgetPayments_, walking each active
// payment's own AnchorDate/Frequency/Interval via @dreda/shared-recurrence's
// nextOccurrenceOnOrAfter rather than depending on any materialized stats
// doc (Payments Calendar browses arbitrarily far into the future, which
// nothing in Firestore precomputes).
//
// Reads plannedPayments, NOT budgetRules — a budget is a monthly spending
// cap for a category, not a schedule, and several planned payments can
// share one category (see FirestorePlannedPayment's header in types.ts).

import { nextOccurrenceOnOrAfter } from '@dreda/shared-recurrence';
import { toDisplay, type CurrencyContext } from './currency';
import { toRecurrenceRule } from './recurrence';
import type { FirestoreAccount, FirestorePlannedPayment, FirestoreCategory } from './types';

export interface UpcomingPayment {
  id: string;
  title: string;
  category: string;
  categoryId: string;
  accountId: string | null;
  account: string;
  amount: number;
  currency: string;
  dueDate: string;
  recurring: boolean;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeUpcomingPayments(
  payments: FirestorePlannedPayment[],
  accounts: FirestoreAccount[],
  categories: FirestoreCategory[],
  ctx: CurrencyContext,
  horizonDays: number
): UpcomingPayment[] {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const from = new Date();
  const until = new Date(from.getTime() + horizonDays * 24 * 3600 * 1000);
  const out: UpcomingPayment[] = [];

  payments.forEach((payment) => {
    const due = nextOccurrenceOnOrAfter(toRecurrenceRule(payment), from, until);
    if (!due) return;
    const native = payment.accountId ? accountCurrency.get(payment.accountId) ?? ctx.base : ctx.base;
    out.push({
      id: payment.id,
      title: payment.description || categoryName.get(payment.categoryId) || payment.categoryId,
      category: categoryName.get(payment.categoryId) ?? payment.categoryId,
      categoryId: payment.categoryId,
      accountId: payment.accountId,
      account: (payment.accountId && accountName.get(payment.accountId)) || '',
      amount: toDisplay(ctx, payment.amount, native),
      currency: ctx.display,
      dueDate: isoDate(due),
      recurring: payment.frequency !== 'Once',
    });
  });

  out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return out;
}
