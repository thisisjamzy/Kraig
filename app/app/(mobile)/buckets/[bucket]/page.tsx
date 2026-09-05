import type { Metadata } from 'next';
import { BucketDetailScreen } from '@/src/screens/BucketDetail/BucketDetailScreen';

export const metadata: Metadata = {
  title: 'Bucket · Dreda',
};

export default async function BucketDetailPage({ params }: PageProps<'/buckets/[bucket]'>) {
  const { bucket } = await params;
  return <BucketDetailScreen bucketId={decodeURIComponent(bucket)} />;
}
