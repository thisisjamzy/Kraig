'use client';

// Two UI lines for the debt forms (docs/UI-LINES.md). Phones keep their own
// form pages (src/phone/screens: CreateDebt, DebtEdit, DebtPlanEdit,
// DebtRepay); from 768px up these URLs show the web forms
// (src/screens/DebtForms), which also open as a side peek. Both lines save
// through the same writes (src/shared/firestore/debtWrites.ts).

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { CreateDebtScreen } from '@/src/phone/screens/CreateDebt/CreateDebtScreen';
import { DebtEditScreen } from '@/src/phone/screens/DebtEdit/DebtEditScreen';
import { DebtPlanEditScreen } from '@/src/phone/screens/DebtPlanEdit/DebtPlanEditScreen';
import { DebtRepayScreen } from '@/src/phone/screens/DebtRepay/DebtRepayScreen';

const WebDebtForm = dynamic(() => import('@/src/screens/DebtForms/DebtFormScreen').then((m) => m.DebtFormScreen), { ssr: false });
const WebPlanForm = dynamic(() => import('@/src/screens/DebtForms/PlanFormScreen').then((m) => m.PlanFormScreen), { ssr: false });
const WebRepaymentForm = dynamic(() => import('@/src/screens/DebtForms/RepaymentFormScreen').then((m) => m.RepaymentFormScreen), { ssr: false });

export function NewDebtRoute() {
  return <DeviceSplit phone={<CreateDebtScreen />} web={<WebDebtForm debtId={null} />} />;
}

export function EditDebtRoute({ debtId }: { debtId: string }) {
  return <DeviceSplit phone={<DebtEditScreen debtId={debtId} />} web={<WebDebtForm debtId={debtId} />} />;
}

export function DebtPlanRoute({ debtId }: { debtId: string }) {
  return <DeviceSplit phone={<DebtPlanEditScreen debtId={debtId} />} web={<WebPlanForm debtId={debtId} />} />;
}

export function RepaymentRoute({ debtId, prefillAmount }: { debtId: string; prefillAmount: string | null }) {
  return <DeviceSplit phone={<DebtRepayScreen debtId={debtId} />} web={<WebRepaymentForm debtId={debtId} prefillAmount={prefillAmount} />} />;
}
