import type { Metadata } from 'next';
import { AllProjectsScreen } from '@/src/routes/AllProjects/AllProjectsScreen';

export const metadata: Metadata = {
  title: 'Projects · Dreda',
};

export default function AllProjectsPage() {
  return <AllProjectsScreen />;
}
