import type { Metadata } from 'next';
import { MoneyDashboardScreen } from '@/src/routes/MoneyDashboard/MoneyDashboardScreen';

export const metadata: Metadata = {
  title: 'Money dashboard · Dreda',
};

// Money mode's dashboard (formerly Insights and Statistics); the route keeps
// its name so existing links still work.
export default function MoneyDashboardPage() {
  return <MoneyDashboardScreen />;
}
