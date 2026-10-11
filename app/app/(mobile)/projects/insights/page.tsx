import type { Metadata } from 'next';
import { TimeDashboardScreen } from '@/src/routes/TimeDashboard/TimeDashboardScreen';

export const metadata: Metadata = {
  title: 'Time dashboard · Dreda',
};

// Time mode's dashboard (formerly Insights); the route keeps its name.
export default function TimeDashboardPage() {
  return <TimeDashboardScreen />;
}
