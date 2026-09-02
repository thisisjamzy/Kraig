import type { Metadata } from 'next';
import { DebtPlanEditScreen } from '@/src/screens/DebtPlanEdit/DebtPlanEditScreen';

export const metadata: Metadata = {
  title: 'Edit payment plan · Dreda',
};

export default async function DebtPlanEditPage({ params }: PageProps<'/debts/[id]/plan'>) {
  const { id } = await params;
  return <DebtPlanEditScreen debtId={decodeURIComponent(id)} />;
}
