import type { Metadata } from 'next';
import { ProjectFormScreen } from '@/src/screens/ProjectForm/ProjectFormScreen';

export const metadata: Metadata = {
  title: 'Edit project · Dreda',
};

export default async function ProjectEditPage({ params }: PageProps<'/projects/[project]/edit'>) {
  const { project } = await params;
  // The same form as New project, in edit mode.
  return <ProjectFormScreen projectId={decodeURIComponent(project)} />;
}
