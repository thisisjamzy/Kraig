'use client';

// Money Insights, level one (phone): the same answer page stacked, under the
// app's own header.

import { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { InsightsPage } from '@/src/widgets/Dashboard/InsightsPage';

export function MoneyInsightsScreen() {
  const v = useMoneyDashboard();
  return <InsightsPage v={v} stickyTop="var(--header-height)" />;
}
