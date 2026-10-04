import type { Metadata } from 'next';
import { RepaymentFormScreen } from '@/src/screens/DebtForms/RepaymentFormScreen';

export const metadata: Metadata = {
  title: 'Record repayment · Dreda',
};

export default async function RecordRepaymentPage({ params, searchParams }: PageProps<'/debts/[id]/repay'>) {
  const { id } = await params;
  const { amount } = await searchParams;
  return <RepaymentFormScreen debtId={decodeURIComponent(id)} prefillAmount={typeof amount === 'string' ? amount : null} />;
}
