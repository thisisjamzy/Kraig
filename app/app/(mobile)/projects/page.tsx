import type { Metadata } from 'next';
import { ProjectsScreen } from '@/src/routes/Projects/ProjectsScreen';

export const metadata: Metadata = {
  title: 'Projects · Dreda',
};

export default function ProjectsPage() {
  return <ProjectsScreen />;
}
