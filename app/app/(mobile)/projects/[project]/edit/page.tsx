import type { Metadata } from 'next';
import { ProjectEditScreen } from '@/src/screens/ProjectEdit/ProjectEditScreen';

export const metadata: Metadata = {
  title: 'Edit project · Dreda',
};

export default async function ProjectEditPage({ params }: PageProps<'/projects/[project]/edit'>) {
  const { project } = await params;
  return <ProjectEditScreen projectId={decodeURIComponent(project)} />;
}
