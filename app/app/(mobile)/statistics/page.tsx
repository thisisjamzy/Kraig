import type { Metadata } from 'next';
import { MoneyInsightsScreen } from '@/src/routes/MoneyInsights/MoneyInsightsScreen';

export const metadata: Metadata = {
  title: 'Insights · Dreda',
};

// Money Insights, level one: the verdict, what is worth doing now and one
// chart. The full breakdown (the dashboard) is at /statistics/breakdown.
export default function MoneyInsightsPage() {
  return <MoneyInsightsScreen />;
}
