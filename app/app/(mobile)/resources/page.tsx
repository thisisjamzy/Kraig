import type { Metadata } from 'next';
import { ResourcesScreen } from '@/src/routes/Resources/ResourcesScreen';

export const metadata: Metadata = {
  title: 'Resources · Dreda',
};

export default function ResourcesPage() {
  return <ResourcesScreen />;
}
