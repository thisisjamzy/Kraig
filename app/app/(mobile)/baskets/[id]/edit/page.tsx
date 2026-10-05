import type { Metadata } from 'next';
import { EditBucketScreen } from '@/src/screens/CreateBucket/CreateBucketScreen';

export const metadata: Metadata = {
  title: 'Edit basket · Dreda',
};

export default async function EditBasketPage({ params }: PageProps<'/baskets/[id]/edit'>) {
  const { id } = await params;
  return <EditBucketScreen basketId={decodeURIComponent(id)} />;
}
