import type { Metadata } from 'next';
import { GoalDetailScreen } from '@/src/screens/GoalDetail/GoalDetailScreen';

export const metadata: Metadata = {
  title: 'Goal · Dreda',
};

export default async function GoalDetailPage({ params }: PageProps<'/goals/[id]'>) {
  const { id } = await params;
  return <GoalDetailScreen goalId={decodeURIComponent(id)} />;
}
