'use client';

// Money Insights (phone): the same one page, stacked, under the app's own
// header (src/widgets/Dashboard/MoneyInsightsPage).

import { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { MoneyInsightsPage } from '@/src/widgets/Dashboard/MoneyInsightsPage';

export function MoneyInsightsScreen() {
  const v = useMoneyDashboard();
  return <MoneyInsightsPage v={v} stickyTop="var(--header-height)" />;
}
