import type { Metadata } from 'next';
import { GoalsAnalyticsScreen } from '@/src/screens/GoalsAnalytics/GoalsAnalyticsScreen';

export const metadata: Metadata = {
  title: 'Goals analytics · Dreda',
};

export default function GoalsAnalyticsPage() {
  return <GoalsAnalyticsScreen />;
}
