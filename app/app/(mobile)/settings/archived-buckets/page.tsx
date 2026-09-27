import type { Metadata } from 'next';
import { ArchivedBucketsScreen } from '@/src/screens/ArchivedBuckets/ArchivedBucketsScreen';

export const metadata: Metadata = {
  title: 'Archived buckets · Dreda',
};

export default function ArchivedBucketsPage() {
  return <ArchivedBucketsScreen />;
}
