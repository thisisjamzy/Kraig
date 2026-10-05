'use client';

// New basket and Edit basket: the shared form (src/forms/BasketForm), as a
// side peek on wide screens and a full-screen form on a phone.

import { BasketForm } from '@/src/forms/BasketForm/BasketForm';

export function CreateBucketScreen() {
  return <BasketForm />;
}

export function EditBucketScreen({ basketId }: { basketId: string }) {
  return <BasketForm basketId={basketId} />;
}
