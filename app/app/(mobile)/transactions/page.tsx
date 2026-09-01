import type { Metadata } from 'next';
import { TransactionHistoryScreen } from '@/src/screens/TransactionHistory/TransactionHistoryScreen';

export const metadata: Metadata = {
  title: 'Transactions · Dreda',
};

export default function TransactionsPage() {
  return <TransactionHistoryScreen />;
}
