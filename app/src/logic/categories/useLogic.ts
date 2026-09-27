'use client';

// Browse every category before creating one — Settings' "Categories" button
// (previously "Create category", jumping straight to a blank form) lands
// here first specifically so a new category isn't accidentally created as a
// near-duplicate of one that already exists but wasn't remembered.

import { useCategories } from '@/src/shared/firestore/queries';
import type { FirestoreCategory } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

const GROUP_ORDER: FirestoreCategory['transactionType'][] = ['Expense', 'Income', 'Savings'];

export function useLogic() {
  const { data: categories, loading, error } = useCategories();

  const groups = GROUP_ORDER.map((transactionType) => ({
    transactionType,
    categories: categories
      .filter((category) => category.transactionType === transactionType)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.categories.length > 0);

  // Back to the page the user came from (skipping forms); '/settings' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings');
  }

  return { groups, loading, error, goBack };
}
