import type { Metadata } from 'next';
import { BucketsAnalyticsScreen } from '@/src/screens/BucketsAnalytics/BucketsAnalyticsScreen';

export const metadata: Metadata = {
  title: 'Buckets analytics · Dreda',
};

export default function BucketsAnalyticsPage() {
  return <BucketsAnalyticsScreen />;
}
