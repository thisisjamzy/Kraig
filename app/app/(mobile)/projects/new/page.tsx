import type { Metadata } from 'next';
import { ProjectFormScreen } from '@/src/screens/ProjectForm/ProjectFormScreen';

export const metadata: Metadata = {
  title: 'New project · Dreda',
};

export default function CreateProjectPage() {
  return <ProjectFormScreen />;
}
