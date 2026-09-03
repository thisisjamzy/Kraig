import type { Metadata } from 'next';
import { ProjectsCalendarScreen } from '@/src/screens/ProjectsCalendar/ProjectsCalendarScreen';

export const metadata: Metadata = {
  title: 'Calendar · Dreda',
};

export default function ProjectsCalendarPage() {
  return <ProjectsCalendarScreen />;
}
