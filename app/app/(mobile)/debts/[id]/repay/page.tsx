import type { Metadata } from 'next';
import { DebtRepayScreen } from '@/src/screens/DebtRepay/DebtRepayScreen';

export const metadata: Metadata = {
  title: 'Record repayment · Dreda',
};

export default async function DebtRepayPage({ params }: PageProps<'/debts/[id]/repay'>) {
  const { id } = await params;
  return <DebtRepayScreen debtId={decodeURIComponent(id)} />;
}
