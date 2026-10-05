import type { Metadata } from 'next';
import { ScheduleRoute } from '@/src/routes/DebtForms/DebtFormRoutes';

export const metadata: Metadata = {
  title: 'Plan a repayment · Dreda',
};

export default function PlanRepaymentPage() {
  return <ScheduleRoute debtId={null} scheduledId={null} />;
}
