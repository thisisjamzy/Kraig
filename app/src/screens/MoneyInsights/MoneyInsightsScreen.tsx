'use client';

// Money Insights (web and tablet): one page, the overview and every
// breakdown section (src/widgets/Dashboard/MoneyInsightsPage).

import { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { MoneyInsightsPage } from '@/src/widgets/Dashboard/MoneyInsightsPage';

export function MoneyInsightsScreen() {
  const v = useMoneyDashboard();
  // Under the web top bar (TopBar.module.css: 44 px plus the safe area).
  return <MoneyInsightsPage v={v} stickyTop="calc(44px + var(--safe-top))" web />;
}
