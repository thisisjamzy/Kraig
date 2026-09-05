import type { Metadata } from 'next';
import { BackfillBatchesScreen } from '@/src/screens/BackfillBatches/BackfillBatchesScreen';

export const metadata: Metadata = {
  title: 'Backfilled transactions · Dreda',
};

export default function BackfillBatchesPage() {
  return <BackfillBatchesScreen />;
}
