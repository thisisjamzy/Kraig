import type { Metadata } from 'next';
import { EditBudgetCategoryScreen } from '@/src/screens/EditBudgetCategory/EditBudgetCategoryScreen';

export const metadata: Metadata = {
  title: 'Edit budget · Dreda',
};

export default async function EditBudgetCategoryPage({ params }: PageProps<'/edit-budget-category/[ruleId]'>) {
  const { ruleId } = await params;
  return <EditBudgetCategoryScreen ruleId={decodeURIComponent(ruleId)} />;
}
