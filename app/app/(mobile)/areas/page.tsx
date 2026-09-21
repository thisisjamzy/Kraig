import type { Metadata } from 'next';
import { AllAreasScreen } from '@/src/screens/AllAreas/AllAreasScreen';

export const metadata: Metadata = {
  title: 'Areas · Dreda',
};

export default function AreasPage() {
  return <AllAreasScreen />;
}
