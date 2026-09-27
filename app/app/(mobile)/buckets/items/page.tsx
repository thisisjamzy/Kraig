import type { Metadata } from 'next';
import { PrioritiesScreen } from '@/src/screens/Plans/PrioritiesScreen';

export const metadata: Metadata = {
  title: 'Priorities · Dreda',
};

// "What should I pay next?" — replaced the Board at the same address.
export default function PrioritiesPage() {
  return <PrioritiesScreen />;
}
