import type { Metadata } from 'next';
import { BucketsScreen } from '@/src/screens/Buckets/BucketsScreen';

export const metadata: Metadata = {
  title: 'Buckets & Debt · Dreda',
};

export default function BucketsPage() {
  return <BucketsScreen />;
}
