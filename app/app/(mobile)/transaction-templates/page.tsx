import type { Metadata } from 'next';
import { TransactionTemplatesScreen } from '@/src/screens/TransactionTemplates/TransactionTemplatesScreen';

export const metadata: Metadata = {
  title: 'Transaction templates · Dreda',
};

export default function TransactionTemplatesPage() {
  return <TransactionTemplatesScreen />;
}
