import type { Metadata } from 'next';
import { PlanningBucketScreen } from '@/src/screens/PlanningBucket/PlanningBucketScreen';

export const metadata: Metadata = {
  title: 'Bucket · Dreda',
};

export default async function PlanningBucketPage({ params }: { params: Promise<{ bucketId: string }> }) {
  const { bucketId } = await params;
  return <PlanningBucketScreen bucketId={bucketId} />;
}
