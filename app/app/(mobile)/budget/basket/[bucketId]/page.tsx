import type { Metadata } from 'next';
import { PlanningBucketScreen } from '@/src/routes/PlanningBucket/PlanningBucketScreen';

export const metadata: Metadata = {
  title: 'Basket · Dreda',
};

export default async function PlanningBucketPage({ params }: { params: Promise<{ bucketId: string }> }) {
  const { bucketId } = await params;
  return <PlanningBucketScreen bucketId={bucketId} />;
}
