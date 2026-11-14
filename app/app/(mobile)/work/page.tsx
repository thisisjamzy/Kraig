import type { Metadata } from 'next';
import { WorkScreen } from '@/src/routes/Work/WorkScreen';

export const metadata: Metadata = {
  title: 'Work · Dreda',
};

// Areas and projects as one page: Tree, Table and Timeline.
export default function WorkPage() {
  return <WorkScreen />;
}
