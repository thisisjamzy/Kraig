import type { Metadata } from 'next';
import { ProjectDetailScreen } from '@/src/screens/ProjectDetail/ProjectDetailScreen';

export const metadata: Metadata = {
  title: 'Project · Dreda',
};

export default async function ProjectDetailPage({ params }: PageProps<'/projects/[project]'>) {
  const { project } = await params;
  return <ProjectDetailScreen projectId={decodeURIComponent(project)} />;
}
