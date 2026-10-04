import type { Metadata } from 'next';
import { TasksListScreen } from '@/src/routes/TasksList/TasksListScreen';

export const metadata: Metadata = {
  title: 'Tasks · Dreda',
};

export default function TasksListPage() {
  return <TasksListScreen />;
}
