import type { Metadata } from 'next';
import { TimePlanScreen } from '@/src/routes/TimePlan/TimePlanScreen';

export const metadata: Metadata = {
  title: 'Plan your time · Dreda',
};

// The time plan: recurring meetings as the locked layer, tasks spread over
// the hours that are left (Remix/Priorities/priorities-forecasting-brief.md).
export default function TimePlanPage() {
  return <TimePlanScreen />;
}
