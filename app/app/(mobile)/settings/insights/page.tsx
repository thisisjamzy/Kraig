import type { Metadata } from 'next';
import { InsightsSettingsScreen } from '@/src/screens/InsightsSettings/InsightsSettingsScreen';

export const metadata: Metadata = {
  title: 'Insights settings · Dreda',
};

export default function InsightsSettingsPage() {
  return <InsightsSettingsScreen />;
}
