'use client';

// The debt forms (New debt, Edit debt, Payment plan, Record repayment,
// Plan a repayment): one
// form each on the form standard (src/screens/DebtForms, FormChrome), a
// full-screen page on a phone and a 640px page from 768px up; opened from
// a debt page on wide screens they show as a side peek instead (PanelHost).
// They save through src/shared/firestore/debtWrites.ts.

import { DebtFormScreen } from '@/src/screens/DebtForms/DebtFormScreen';
import { PlanFormScreen } from '@/src/screens/DebtForms/PlanFormScreen';
import { RepaymentFormScreen } from '@/src/screens/DebtForms/RepaymentFormScreen';
import { ScheduleFormScreen } from '@/src/screens/DebtForms/ScheduleFormScreen';

export function NewDebtRoute() {
  return <DebtFormScreen debtId={null} />;
}

export function EditDebtRoute({ debtId }: { debtId: string }) {
  return <DebtFormScreen debtId={debtId} />;
}

export function DebtPlanRoute({ debtId }: { debtId: string }) {
  return <PlanFormScreen debtId={debtId} />;
}

export function RepaymentRoute({ debtId, prefillAmount, scheduledId = null }: { debtId: string; prefillAmount: string | null; scheduledId?: string | null }) {
  return <RepaymentFormScreen debtId={debtId} prefillAmount={prefillAmount} scheduledId={scheduledId} />;
}

/** Plan a repayment: on one debt, or (from Payments) choosing the debt first. */
export function ScheduleRoute({ debtId, scheduledId }: { debtId: string | null; scheduledId: string | null }) {
  return <ScheduleFormScreen debtId={debtId} scheduledId={scheduledId} />;
}
