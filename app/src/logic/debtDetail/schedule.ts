// A debt's repayment schedule for its page, web and phone alike: the
// scheduled one-off repayments (with "Everything left" worked out) and the
// next repayments of the repeating plan and the scheduled ones together,
// so a December with both shows both. Pure on top of
// src/viewmodels/debtSchedule.ts.

import { planLikeOf, scheduledLikeOf, hasBudgetLine } from '@/src/shared/firestore/debtSchedule';
import { repaymentSchedule } from '@/src/viewmodels/debtSchedule';
import type { FirestoreDebt } from '@/src/shared/firestore/types';

export interface ScheduledRow {
  id: string;
  date: Date;
  amount: number;
  everything: boolean;
  recorded: boolean;
  /** "UBA", "Any income", ... (null: not chosen). */
  from: string | null;
  /** Has a line in the Debt repayments basket (false: tracked on the debt only). */
  budgetLine: boolean;
  note: string;
}

export interface UpcomingRepayment {
  key: string;
  date: Date;
  amount: number;
  kind: 'repeating' | 'scheduled';
  scheduledId: string | null;
}

export function debtScheduleRows(
  debt: Pick<FirestoreDebt, 'currentBalance' | 'paymentPlan' | 'debtType'> | null,
  fromLabel: (paidFrom: NonNullable<FirestoreDebt['paymentPlan']['scheduled']>[number]['paidFrom']) => string | null,
  count = 6
): { scheduled: ScheduledRow[]; upcoming: UpcomingRepayment[]; overBy: number } {
  if (!debt) return { scheduled: [], upcoming: [], overBy: 0 };
  const list = debt.paymentPlan.scheduled ?? [];
  const schedule = repaymentSchedule(debt.currentBalance, planLikeOf(debt), scheduledLikeOf(list));
  const scheduled = list
    .map((s) => ({
      id: s.id,
      date: s.date.toDate(),
      amount: s.repaymentId ? (s.amount ?? 0) : (schedule.amountOf.get(s.id) ?? s.amount ?? 0),
      everything: s.amountMode === 'everything',
      recorded: Boolean(s.repaymentId),
      from: fromLabel(s.paidFrom),
      budgetLine: hasBudgetLine(debt, s.paidFrom),
      note: s.note,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const upcoming = schedule.events.slice(0, count).map((e) => ({ key: e.key, date: e.date, amount: e.amount, kind: e.kind, scheduledId: e.scheduledId }));
  return { scheduled, upcoming, overBy: schedule.overBy };
}
