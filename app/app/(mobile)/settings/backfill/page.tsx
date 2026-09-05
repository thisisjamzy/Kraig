import type { Metadata } from 'next';
import { BackfillSpreadScreen } from '@/src/screens/BackfillSpread/BackfillSpreadScreen';

export const metadata: Metadata = {
  title: 'Backfill transactions · Dreda',
};

export default function BackfillSpreadPage() {
  return <BackfillSpreadScreen />;
}
