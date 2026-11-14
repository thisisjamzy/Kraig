'use client';

// Money Insights, level one (web and tablet): the answer page. The full
// chart page is one level down at /statistics/breakdown.

import { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { InsightsPage } from '@/src/widgets/Dashboard/InsightsPage';

export function MoneyInsightsScreen() {
  const v = useMoneyDashboard();
  // Under the web top bar (TopBar.module.css: 44 px plus the safe area).
  return <InsightsPage v={v} stickyTop="calc(44px + var(--safe-top))" web />;
}
