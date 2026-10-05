import type { Metadata } from 'next';
import { BucketDetailScreen } from '@/src/routes/BucketDetail/BucketDetailScreen';

export const metadata: Metadata = {
  title: 'Basket · Dreda',
};

export default async function BucketDetailPage({ params }: PageProps<'/baskets/[id]'>) {
  const { id } = await params;
  return <BucketDetailScreen goalId={decodeURIComponent(id)} />;
}
