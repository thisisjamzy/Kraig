import type { Metadata } from 'next';
import { TaskEditScreen } from '@/src/screens/TaskEdit/TaskEditScreen';

export const metadata: Metadata = {
  title: 'Edit task · Dreda',
};

export default async function EditTaskPage({ params }: PageProps<'/tasks/[id]/edit'>) {
  const { id } = await params;
  return <TaskEditScreen taskId={decodeURIComponent(id)} />;
}
