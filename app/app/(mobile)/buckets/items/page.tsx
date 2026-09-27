import type { Metadata } from 'next';
import { BucketItemsScreen } from '@/src/screens/BucketItems/BucketItemsScreen';

export const metadata: Metadata = {
  title: 'All bucket items · Dreda',
};

export default function BucketItemsPage() {
  return <BucketItemsScreen />;
}
