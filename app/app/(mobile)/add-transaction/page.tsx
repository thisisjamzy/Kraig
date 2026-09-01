import type { Metadata } from 'next';
import { AddTransactionScreen } from '@/src/screens/AddTransaction/AddTransactionScreen';

export const metadata: Metadata = {
  title: 'Add transaction · Dreda',
};

export default function AddTransactionPage() {
  return <AddTransactionScreen />;
}
