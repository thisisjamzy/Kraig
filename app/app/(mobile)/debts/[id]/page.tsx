import type { Metadata } from 'next';
import { DebtDetailScreen } from '@/src/screens/DebtDetail/DebtDetailScreen';

export const metadata: Metadata = {
  title: 'Debt · Dreda',
};

export default async function DebtDetailPage({ params }: PageProps<'/debts/[id]'>) {
  const { id } = await params;
  return <DebtDetailScreen debtId={decodeURIComponent(id)} />;
}
