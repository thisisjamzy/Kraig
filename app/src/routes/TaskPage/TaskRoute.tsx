'use client';

// /tasks/<id>/edit, two UI lines (docs/UI-LINES.md): phones get the task
// form; from 768px up the task as a Notion page edited in place (or the
// form with ?form=1).

import dynamic from 'next/dynamic';
import { useSearchParamOnce } from '@/src/shared/navigation/useMonthParam';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TaskEditScreen } from '@/src/screens/TaskEdit/TaskEditScreen';

const TaskFullPage = dynamic(() => import('@/src/screens/TaskPage/TaskPage').then((m) => m.TaskFullPage), { ssr: false });

export function TaskRoute({ taskId }: { taskId: string }) {
  const form = useSearchParamOnce('form');
  return <DeviceSplit phone={<TaskEditScreen taskId={taskId} />} web={form ? <TaskEditScreen taskId={taskId} /> : <TaskFullPage taskId={taskId} />} />;
}
