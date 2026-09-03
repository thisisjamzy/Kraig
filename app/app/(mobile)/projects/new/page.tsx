import type { Metadata } from 'next';
import { CreateProjectScreen } from '@/src/screens/CreateProject/CreateProjectScreen';

export const metadata: Metadata = {
  title: 'New project · Dreda',
};

export default function CreateProjectPage() {
  return <CreateProjectScreen />;
}
