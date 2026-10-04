import type { Metadata } from 'next';
import { BucketLineItemFormScreen } from '@/src/routes/BucketLineItemForm/BucketLineItemFormScreen';

export const metadata: Metadata = {
  title: 'Add bucket item · Dreda',
};

export default async function AddBucketItemPage({ params }: PageProps<'/add-bucket-item/[goalId]'>) {
  const { goalId } = await params;
  return <BucketLineItemFormScreen goalId={decodeURIComponent(goalId)} />;
}
