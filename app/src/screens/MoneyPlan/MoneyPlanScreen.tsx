'use client';

// The money plan on web and tablet: the shared page (src/widgets/Planner)
// with no page background; the top bar's breadcrumb names the page.

import { useMoneyPlan } from '@/src/logic/moneyPlan/useMoneyPlan';
import { MoneyPlanPage } from '@/src/widgets/Planner/MoneyPlanPage';

export function MoneyPlanScreen() {
  const logic = useMoneyPlan();
  return <MoneyPlanPage logic={logic} web />;
}
