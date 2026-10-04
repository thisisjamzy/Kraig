'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

import dynamic from 'next/dynamic';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { TasksListScreen as PhoneTasksListScreen } from '@/src/phone/screens/TasksList/TasksListScreen';

const WebTasksListScreen = dynamic(() => import('@/src/screens/TasksList/TasksListScreen').then((m) => m.TasksListScreen), { ssr: false });

export function TasksListScreen() {
  return <DeviceSplit phone={<PhoneTasksListScreen />} web={<WebTasksListScreen />} />;
}
