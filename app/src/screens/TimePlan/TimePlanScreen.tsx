'use client';

// The time plan on web and tablet: the shared page (src/widgets/Planner)
// with no page background; the top bar's breadcrumb names the page.

import { useTimePlan } from '@/src/logic/timePlan/useTimePlan';
import { TimePlanPage } from '@/src/widgets/Planner/TimePlanPage';

export function TimePlanScreen() {
  const logic = useTimePlan();
  return <TimePlanPage logic={logic} web />;
}
