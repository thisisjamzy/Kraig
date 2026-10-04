import type { Metadata } from 'next';
import { BucketsAnalyticsRoute } from '@/src/routes/BucketsAnalytics/BucketsAnalyticsRoute';

export const metadata: Metadata = {
  title: 'Buckets analytics · Dreda',
};

export default function BucketsAnalyticsPage() {
  return <BucketsAnalyticsRoute />;
}
