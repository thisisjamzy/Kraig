import type { Metadata } from 'next';
import { CreateGoalScreen } from '@/src/screens/CreateGoal/CreateGoalScreen';

export const metadata: Metadata = {
  title: 'New goal · Dreda',
};

export default function CreateGoalPage() {
  return <CreateGoalScreen />;
}
