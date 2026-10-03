import type { Metadata } from 'next';
import { TaskRoute } from '@/src/screens/TaskPage/TaskRoute';

export const metadata: Metadata = {
  title: 'Task · Dreda',
};

export default async function EditTaskPage({ params }: PageProps<'/tasks/[id]/edit'>) {
  const { id } = await params;
  return <TaskRoute taskId={decodeURIComponent(id)} />;
}
