import type { Metadata } from 'next';
import { EditTransactionScreen } from '@/src/screens/EditTransaction/EditTransactionScreen';

export const metadata: Metadata = {
  title: 'Edit transaction · Dreda',
};

export default async function EditTransactionPage({ params }: PageProps<'/edit-transaction/[id]'>) {
  const { id } = await params;
  return <EditTransactionScreen transactionId={decodeURIComponent(id)} />;
}
