'use client';

// /tasks/<id>/edit: on medium screens and up, the task as a Notion page
// (edited in place); on phones, or with ?form=1, the task form.

import dynamic from 'next/dynamic';
import { useSearchParamOnce } from '@/src/shared/navigation/useMonthParam';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { TaskFullPage } from './TaskPage';

const TaskEditScreen = dynamic(() => import('@/src/screens/TaskEdit/TaskEditScreen').then((m) => m.TaskEditScreen), { ssr: false });

export function TaskRoute({ taskId }: { taskId: string }) {
  const { isWide } = useLayout();
  const form = useSearchParamOnce('form');
  if (isWide && !form) return <TaskFullPage taskId={taskId} />;
  return <TaskEditScreen taskId={taskId} />;
}
