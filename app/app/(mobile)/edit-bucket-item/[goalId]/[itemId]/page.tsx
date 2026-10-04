import type { Metadata } from 'next';
import { BucketLineItemFormScreen } from '@/src/routes/BucketLineItemForm/BucketLineItemFormScreen';

export const metadata: Metadata = {
  title: 'Edit bucket item · Dreda',
};

export default async function EditBucketItemPage({ params }: PageProps<'/edit-bucket-item/[goalId]/[itemId]'>) {
  const { goalId, itemId } = await params;
  return <BucketLineItemFormScreen goalId={decodeURIComponent(goalId)} itemId={decodeURIComponent(itemId)} />;
}
