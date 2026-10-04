import type { Metadata } from 'next';
import { InsightsScreen } from '@/src/routes/Insights/InsightsScreen';

export const metadata: Metadata = {
  title: 'Insights · Dreda',
};

export default function InsightsPage() {
  return <InsightsScreen />;
}
