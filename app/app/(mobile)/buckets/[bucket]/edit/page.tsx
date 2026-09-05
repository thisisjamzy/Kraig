import type { Metadata } from 'next';
import { BucketEditScreen } from '@/src/screens/BucketEdit/BucketEditScreen';

export const metadata: Metadata = {
  title: 'Edit bucket · Dreda',
};

export default async function BucketEditPage({ params }: PageProps<'/buckets/[bucket]/edit'>) {
  const { bucket } = await params;
  return <BucketEditScreen bucketId={decodeURIComponent(bucket)} />;
}
