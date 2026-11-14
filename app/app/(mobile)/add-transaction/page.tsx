import type { Metadata } from 'next';
import { AddTransactionScreen } from '@/src/screens/AddTransaction/AddTransactionScreen';
import { PeekOnWide } from '@/src/shared/navigation/PeekOnWide';

export const metadata: Metadata = {
  title: 'Add transaction · Dreda',
};

export default function AddTransactionPage() {
  // Tablet and web: the right-hand panel over Transactions.
  return (
    <PeekOnWide kind="transaction" over="/transactions">
      <AddTransactionScreen />
    </PeekOnWide>
  );
}
