import type { Metadata } from 'next';
import { AddBudgetCategoryScreen } from '@/src/screens/AddBudgetCategory/AddBudgetCategoryScreen';

export const metadata: Metadata = {
  title: 'Add budget category · Dreda',
};

export default function AddBudgetCategoryPage() {
  return <AddBudgetCategoryScreen />;
}
