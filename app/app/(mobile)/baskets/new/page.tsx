import type { Metadata } from 'next';
import { CreateBucketScreen } from '@/src/screens/CreateBucket/CreateBucketScreen';

export const metadata: Metadata = {
  title: 'New basket · Dreda',
};

export default function CreateBucketPage() {
  return <CreateBucketScreen />;
}
