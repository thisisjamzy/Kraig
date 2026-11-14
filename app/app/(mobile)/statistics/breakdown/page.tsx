import type { Metadata } from 'next';
import { MoneyDashboardScreen } from '@/src/routes/MoneyDashboard/MoneyDashboardScreen';

export const metadata: Metadata = {
  title: 'Full breakdown · Insights · Dreda',
};

// Money Insights, level two: every chart the dashboard has, under a back link
// and a section nav.
export default function MoneyBreakdownPage() {
  return <MoneyDashboardScreen />;
}
