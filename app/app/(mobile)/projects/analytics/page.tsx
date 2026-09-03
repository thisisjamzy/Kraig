import type { Metadata } from 'next';
import { ProjectAnalyticsScreen } from '@/src/screens/ProjectAnalytics/ProjectAnalyticsScreen';

export const metadata: Metadata = {
  title: 'Analytics · Dreda',
};

export default function ProjectAnalyticsPage() {
  return <ProjectAnalyticsScreen />;
}
