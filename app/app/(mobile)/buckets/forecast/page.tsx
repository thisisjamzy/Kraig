import type { Metadata } from 'next';
import { PlansForecastScreen } from '@/src/screens/Plans/PlansForecastScreen';

export const metadata: Metadata = {
  title: 'Plans forecast · Dreda',
};

export default function PlansForecastPage() {
  return <PlansForecastScreen />;
}
