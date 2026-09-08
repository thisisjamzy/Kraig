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
import type {
  FirestoreAccount,
  FirestorePlannedPayment,
  FirestoreCategory,
  FirestoreGoal,
  FirestoreGoalLineItem,
  GoalItemNecessity,
} from './types';

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

// ---------------------------------------------------------------------
// Goal-item-sourced upcoming payments — replaces the plannedPayments-based
// computeUpcomingPayments above for both Home and the Payments Calendar.
// plannedPayments itself is left alone (collection + computeUpcomingPayments
// both still exist, just uncalled) rather than migrated or deleted.
// ---------------------------------------------------------------------

export interface UpcomingGoalPayment {
  id: string;
  goalId: string;
  title: string;
  category: string;
  categoryId: string;
  accountId: string | null;
  account: string;
  amount: number;
  currency: string;
  dueDate: string;
  necessity: GoalItemNecessity;
  // A Fixed goal's item repeats (its own recurrence field) — surfaced so
  // the UI can badge it the same way a recurring plannedPayment used to be.
  recurring: boolean;
}

/**
 * Every active goal's own not-yet-completed line items that have a due
 * date, walked forward through `horizonDays`. A Fixed goal's item repeats
 * according to its own `recurrence` (built into a plain RecurrenceRule
 * anchored on the item's stored dueDate, `endCondition: 'Never'` — a Fixed
 * goal's recurring cost has no built-in end); a Variable item's dueDate is
 * always a single occurrence, shown only if it falls in the window.
 */
export function computeUpcomingPaymentsFromGoalItems(
  goals: FirestoreGoal[],
  itemsByGoal: Record<string, FirestoreGoalLineItem[]>,
  accounts: FirestoreAccount[],
  categories: FirestoreCategory[],
  ctx: CurrencyContext,
  horizonDays: number
): UpcomingGoalPayment[] {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const from = new Date();
  const until = new Date(from.getTime() + horizonDays * 24 * 3600 * 1000);
  const out: UpcomingGoalPayment[] = [];

  for (const goal of goals) {
    for (const item of itemsByGoal[goal.id] ?? []) {
      if (item.completed || !item.dueDate) continue;
      // No recurrence field (a Variable item) defaults to 'Once' — a single
      // occurrence on the stored dueDate, same as a plain plannedPayment
      // used to behave.
      const due = nextOccurrenceOnOrAfter(
        {
          frequency: item.recurrence?.frequency ?? 'Once',
          interval: item.recurrence?.interval ?? 1,
          anchorDate: item.dueDate.toDate(),
          endCondition: 'Never',
        },
        from,
        until
      );
      if (!due) continue;
      const native = item.accountId ? accountCurrency.get(item.accountId) ?? goal.currency : goal.currency;
      out.push({
        id: item.id,
        goalId: goal.id,
        title: item.name || categoryName.get(item.categoryId ?? '') || 'Payment',
        category: categoryName.get(item.categoryId ?? '') ?? item.categoryId ?? '—',
        categoryId: item.categoryId ?? '',
        accountId: item.accountId ?? null,
        account: (item.accountId && accountName.get(item.accountId)) || '',
        amount: toDisplay(ctx, item.amount, native),
        currency: ctx.display,
        dueDate: isoDate(due),
        necessity: item.necessity ?? 'NiceToHave',
        recurring: Boolean(item.recurrence),
      });
    }
  }

  out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return out;
}
