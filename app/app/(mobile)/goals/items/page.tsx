import type { Metadata } from 'next';
import { GoalItemsScreen } from '@/src/screens/GoalItems/GoalItemsScreen';

export const metadata: Metadata = {
  title: 'All goal items · Dreda',
};

export default function GoalItemsPage() {
  return <GoalItemsScreen />;
}
