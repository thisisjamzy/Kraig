import type { Metadata } from 'next';
import { GoalLineItemFormScreen } from '@/src/screens/GoalLineItemForm/GoalLineItemFormScreen';

export const metadata: Metadata = {
  title: 'Edit goal item · Dreda',
};

export default async function EditGoalItemPage({ params }: PageProps<'/edit-goal-item/[goalId]/[itemId]'>) {
  const { goalId, itemId } = await params;
  return <GoalLineItemFormScreen goalId={decodeURIComponent(goalId)} itemId={decodeURIComponent(itemId)} />;
}
