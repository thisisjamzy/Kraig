import type { Metadata } from 'next';
import { StatisticsScreen } from '@/src/screens/Statistics/StatisticsScreen';

export const metadata: Metadata = {
  title: 'Statistics · Dreda',
};

export default function StatisticsPage() {
  return <StatisticsScreen />;
}
