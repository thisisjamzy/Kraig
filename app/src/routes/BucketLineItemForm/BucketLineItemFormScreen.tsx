'use client';

// New and edit basket item: one form on the form standard (src/forms), a
// full-screen page on a phone and its own page or a side peek from 768px up
// (FormFrame draws each).

import { BasketItemForm } from '@/src/forms/BasketItemForm/BasketItemForm';

export function BucketLineItemFormScreen({ goalId, itemId }: { goalId: string; itemId?: string }) {
  return <BasketItemForm goalId={goalId} itemId={itemId} />;
}
