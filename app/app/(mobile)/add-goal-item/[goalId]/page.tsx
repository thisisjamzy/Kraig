import type { Metadata } from 'next';
import { GoalLineItemFormScreen } from '@/src/screens/GoalLineItemForm/GoalLineItemFormScreen';

export const metadata: Metadata = {
  title: 'Add goal item · Dreda',
};

export default async function AddGoalItemPage({ params }: PageProps<'/add-goal-item/[goalId]'>) {
  const { goalId } = await params;
  return <GoalLineItemFormScreen goalId={decodeURIComponent(goalId)} />;
}
