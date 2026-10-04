import type { Metadata } from 'next';
import { ProjectInsightsScreen } from '@/src/routes/ProjectInsights/ProjectInsightsScreen';

export const metadata: Metadata = {
  title: 'Project insights · Dreda',
};

export default async function ProjectInsightsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectInsightsScreen projectId={projectId} />;
}
