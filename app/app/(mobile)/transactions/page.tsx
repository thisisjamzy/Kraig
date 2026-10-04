import type { Metadata } from 'next';
import { TransactionsScreen } from '@/src/routes/Transactions/TransactionsScreen';
import { TransactionHistoryScreen } from '@/src/routes/TransactionHistory/TransactionHistoryScreen';

export const metadata: Metadata = {
  title: 'Transactions · Dreda',
};

// One backfill spread's records (Settings > Backfill) keep their own list;
// everything else is the month's Transactions page.
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.backfillBatch) return <TransactionHistoryScreen />;
  return <TransactionsScreen filtered={Boolean(params.bucket || params.category)} />;
}
