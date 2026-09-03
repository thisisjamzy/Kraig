'use client';

// "What needs my attention today" — every not-done task, split into
// priority classes, plus a quick read on how today (and the last week) is
// going. Everything project-related (Active projects, the old completed-
// trend/reschedule stats) moved to the Analytics screen, which is the one
// place in Projects mode that's specifically about numbers rather than
// action — this one stays a plain worklist plus a single at-a-glance trend.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { pendingTasksByPriority, dailySuccessTrend } from '@/src/shared/firestore/taskInsights';
import { PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import type { Priority } from '@/src/shared/firestore/types';

const SUCCESS_TREND_DAYS = 7;

export type FocusPriorityFilter = Priority | 'All';

function timeLeftToday(): string {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const diffMinutes = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function useLogic() {
  const router = useRouter();
  const { data: tasks, loading } = useAllTasks();
  const [priorityFilter, setPriorityFilter] = useState<FocusPriorityFilter>('All');

  const priorityGroups = useMemo(() => pendingTasksByPriority(tasks), [tasks]);
  const visiblePriorities = priorityFilter === 'All' ? PRIORITY_LEVELS : [priorityFilter];
  const successTrend = useMemo(() => dailySuccessTrend(tasks, SUCCESS_TREND_DAYS), [tasks]);
  const todaySuccess = successTrend.length > 0 ? successTrend[successTrend.length - 1].value : 0;

  function openTask(taskId: string) {
    router.push(`/tasks/${taskId}/edit`);
  }

  return {
    priorityGroups,
    priorityFilter,
    setPriorityFilter,
    visiblePriorities,
    successTrend,
    todaySuccess,
    timeLeftToday: timeLeftToday(),
    openTask,
    loading,
  };
}
