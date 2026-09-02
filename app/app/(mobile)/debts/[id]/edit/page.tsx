import type { Metadata } from 'next';
import { DebtEditScreen } from '@/src/screens/DebtEdit/DebtEditScreen';

export const metadata: Metadata = {
  title: 'Edit debt · Dreda',
};

export default async function DebtEditPage({ params }: PageProps<'/debts/[id]/edit'>) {
  const { id } = await params;
  return <DebtEditScreen debtId={decodeURIComponent(id)} />;
}
