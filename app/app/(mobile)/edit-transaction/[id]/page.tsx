import type { Metadata } from 'next';
import { EditTransactionScreen } from '@/src/screens/EditTransaction/EditTransactionScreen';
import { PeekOnWide } from '@/src/shared/navigation/PeekOnWide';

export const metadata: Metadata = {
  title: 'Edit transaction · Dreda',
};

export default async function EditTransactionPage({ params }: PageProps<'/edit-transaction/[id]'>) {
  const { id } = await params;
  const transactionId = decodeURIComponent(id);
  // Tablet and web: the right-hand panel over Transactions.
  return (
    <PeekOnWide kind="edit-transaction" over="/transactions" params={{ id: transactionId }}>
      <EditTransactionScreen transactionId={transactionId} />
    </PeekOnWide>
  );
}
