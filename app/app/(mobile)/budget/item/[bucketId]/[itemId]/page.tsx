import type { Metadata } from 'next';
import { PlanningItemScreen } from '@/src/routes/PlanningItem/PlanningItemScreen';

export const metadata: Metadata = {
  title: 'Budget item · Dreda',
};

export default async function PlanningItemPage({ params }: { params: Promise<{ bucketId: string; itemId: string }> }) {
  const { bucketId, itemId } = await params;
  return <PlanningItemScreen bucketId={bucketId} itemId={itemId} />;
}
