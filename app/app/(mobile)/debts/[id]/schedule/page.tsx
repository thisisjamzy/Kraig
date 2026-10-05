import type { Metadata } from 'next';
import { ScheduleRoute } from '@/src/routes/DebtForms/DebtFormRoutes';

export const metadata: Metadata = {
  title: 'Plan a repayment · Dreda',
};

export default async function PlanDebtRepaymentPage({ params, searchParams }: PageProps<'/debts/[id]/schedule'>) {
  const { id } = await params;
  const { scheduled } = await searchParams;
  return <ScheduleRoute debtId={decodeURIComponent(id)} scheduledId={typeof scheduled === 'string' ? scheduled : null} />;
}
