import type { Metadata } from 'next';
import { ReallocateScreen } from '@/src/screens/PlanningFlows/ReallocateScreen';

export const metadata: Metadata = {
  title: 'Reallocate · Dreda',
};

export default function ReallocatePage() {
  return <ReallocateScreen />;
}
