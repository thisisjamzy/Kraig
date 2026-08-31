import type { Metadata } from 'next';
import { BudgetScreen } from '@/src/screens/Budget/BudgetScreen';

export const metadata: Metadata = {
  title: 'Budget · Dreda',
};

export default function BudgetPage() {
  return <BudgetScreen />;
}
