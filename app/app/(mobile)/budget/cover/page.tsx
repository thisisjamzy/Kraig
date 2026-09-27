import type { Metadata } from 'next';
import { CoverScreen } from '@/src/screens/PlanningFlows/CoverScreen';

export const metadata: Metadata = {
  title: 'Cover or justify · Dreda',
};

export default function CoverPage() {
  return <CoverScreen />;
}
