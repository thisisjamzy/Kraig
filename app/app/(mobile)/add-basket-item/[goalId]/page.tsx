import type { Metadata } from 'next';
import { BucketLineItemFormScreen } from '@/src/routes/BucketLineItemForm/BucketLineItemFormScreen';

export const metadata: Metadata = {
  title: 'Add basket item · Dreda',
};

export default async function AddBucketItemPage({ params }: PageProps<'/add-basket-item/[goalId]'>) {
  const { goalId } = await params;
  return <BucketLineItemFormScreen goalId={decodeURIComponent(goalId)} />;
}
