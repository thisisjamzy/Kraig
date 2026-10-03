'use client';

// Renders the task side panel from the URL (?task=<id> or ?task=new, see
// src/shared/navigation/taskPanel.ts) on medium screens and up. An
// existing task opens as its Notion page in a side peek (TaskPeek, edited
// in place); a new task, or ?form=1, opens the task form (TaskEditScreen,
// drawn as a right panel by WebFormPanel). On a phone, a link like that
// goes to the full page instead; phones never show panels.

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { TASK_PARAM, PREFILL_PARAMS, taskPageHref, withoutTaskPanel } from '@/src/shared/navigation/taskPanel';
import dynamic from 'next/dynamic';

// Loaded only when a panel actually opens.
const TaskEditScreen = dynamic(() => import('@/src/screens/TaskEdit/TaskEditScreen').then((m) => m.TaskEditScreen), { ssr: false });
const TaskPeek = dynamic(() => import('@/src/screens/TaskPage/TaskPage').then((m) => m.TaskPeek), { ssr: false });

export function PanelHost() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { isWide, deviceClass } = useLayout();
  const task = params.get(TASK_PARAM);

  // A phone opening a panel link: the full page, same as tapping the task.
  useEffect(() => {
    if (!task || isWide) return;
    const prefill: Record<string, string> = {};
    for (const p of PREFILL_PARAMS) {
      const v = params.get(p);
      if (v) prefill[p] = v;
    }
    // Hydration reports 'compact' everywhere for one render — check the
    // real width before sending a tablet away.
    if (window.matchMedia('(min-width: 768px)').matches) return;
    router.replace(taskPageHref(task, prefill));
  }, [task, isWide, params, router, deviceClass]);

  if (!task || !isWide) return null;
  const close = () => router.replace(withoutTaskPanel(pathname, params.toString()), { scroll: false });
  if (task !== 'new' && !params.get('form')) {
    const sp = new URLSearchParams(params.toString());
    sp.set('form', '1');
    return <TaskPeek key={task} taskId={task} onClose={close} fullHref={taskPageHref(task)} formHref={`${pathname}?${sp.toString()}`} />;
  }
  return <TaskEditScreen key={task} taskId={task === 'new' ? null : task} onClose={close} />;
}
