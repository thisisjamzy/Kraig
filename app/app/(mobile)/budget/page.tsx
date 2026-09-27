import type { Metadata } from 'next';
import { PlanningScreen } from '@/src/screens/Planning/PlanningScreen';

export const metadata: Metadata = {
  title: 'Planning · Dreda',
};

export default function BudgetPage() {
  return <PlanningScreen />;
}
