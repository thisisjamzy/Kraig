import type { Metadata } from 'next';
import { RepaymentRoute } from '@/src/routes/DebtForms/DebtFormRoutes';

export const metadata: Metadata = {
  title: 'Record repayment · Dreda',
};

export default async function RecordRepaymentPage({ params, searchParams }: PageProps<'/debts/[id]/repay'>) {
  const { id } = await params;
  const { amount, scheduled } = await searchParams;
  return <RepaymentRoute debtId={decodeURIComponent(id)} prefillAmount={typeof amount === 'string' ? amount : null} scheduledId={typeof scheduled === 'string' ? scheduled : null} />;
}
