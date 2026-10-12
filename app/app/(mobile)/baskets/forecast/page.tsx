import type { Metadata } from 'next';
import { MoneyPlanScreen } from '@/src/routes/MoneyPlan/MoneyPlanScreen';

export const metadata: Metadata = {
  title: 'Plan and forecast · Dreda',
};

// The money plan: the locked layer (income and fixed costs) and what you
// plan on top of it (Remix/Priorities/priorities-forecasting-brief.md).
export default function MoneyPlanPage() {
  return <MoneyPlanScreen />;
}
