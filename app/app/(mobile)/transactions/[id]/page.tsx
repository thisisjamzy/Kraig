import type { Metadata } from 'next';
import { TransactionDetailsScreen } from '@/src/screens/TransactionDetails/TransactionDetailsScreen';

export const metadata: Metadata = {
  title: 'Transaction · Dreda',
};

export default async function TransactionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransactionDetailsScreen id={id} />;
}
