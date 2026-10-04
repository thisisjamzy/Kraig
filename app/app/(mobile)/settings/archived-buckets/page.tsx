import type { Metadata } from 'next';
import { ArchivedBucketsScreen } from '@/src/routes/ArchivedBuckets/ArchivedBucketsScreen';

export const metadata: Metadata = {
  title: 'Archived buckets · Dreda',
};

export default function ArchivedBucketsPage() {
  return <ArchivedBucketsScreen />;
}
