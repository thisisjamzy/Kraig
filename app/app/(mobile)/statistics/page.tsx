import type { Metadata } from 'next';
import { MoneyInsightsScreen } from '@/src/routes/MoneyInsights/MoneyInsightsScreen';

export const metadata: Metadata = {
  title: 'Insights · Dreda',
};

// Money Insights: one page, the overview (verdict, what is worth doing now,
// the period figures) and every breakdown section.
export default function MoneyInsightsPage() {
  return <MoneyInsightsScreen />;
}
