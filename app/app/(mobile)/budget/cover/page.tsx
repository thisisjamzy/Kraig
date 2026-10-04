import type { Metadata } from 'next';
import { CoverScreen } from '@/src/routes/PlanningFlows/CoverScreen';

export const metadata: Metadata = {
  title: 'Cover or justify · Dreda',
};

export default function CoverPage() {
  return <CoverScreen />;
}
