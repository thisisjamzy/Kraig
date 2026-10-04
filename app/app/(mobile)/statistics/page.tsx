import type { Metadata } from 'next';
import { FinanceInsightsScreen } from '@/src/routes/FinanceInsights/FinanceInsightsScreen';

export const metadata: Metadata = {
  title: 'Insights · Dreda',
};

// Money mode's Insights (formerly Statistics) — the route keeps its name so
// existing links still work.
export default function InsightsPage() {
  return <FinanceInsightsScreen />;
}
