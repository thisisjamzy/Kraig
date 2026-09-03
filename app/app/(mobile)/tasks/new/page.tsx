import type { Metadata } from 'next';
import { TaskEditScreen } from '@/src/screens/TaskEdit/TaskEditScreen';

export const metadata: Metadata = {
  title: 'New task · Dreda',
};

export default function CreateTaskPage() {
  return <TaskEditScreen taskId={null} />;
}
