import type { Metadata } from 'next';
import { BucketsScreen } from '@/src/routes/Buckets/BucketsScreen';

export const metadata: Metadata = {
  title: 'Buckets & Debt · Dreda',
};

export default function BucketsPage() {
  return <BucketsScreen />;
}
