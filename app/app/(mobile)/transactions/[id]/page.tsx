import type { Metadata } from 'next';
import { TransactionDetailsScreen } from '@/src/routes/TransactionDetails/TransactionDetailsScreen';

export const metadata: Metadata = {
  title: 'Transaction · Dreda',
};

export default async function TransactionDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  // ?kind=transfer: the id is a transfer's; ?assign=1 opens the basket picker.
  return <TransactionDetailsScreen id={id} transfer={search.kind === 'transfer'} assign={search.assign === '1'} />;
}
