'use client';

// Insights notifications (each can be switched off in Settings > Insights):
//   - morning summary, once a day at the start of working hours: today's
//     load and any red alerts;
//   - a project or milestone turning red;
//   - evening nudge, once a day at the end of working hours, when under the
//     nudge threshold of today's tasks are done — it opens today's list,
//     where the leftovers can be moved to tomorrow in one tap.
// Checked each minute while the app is open (see notify.ts for why not in
// the background). What was already sent is remembered per device.

import { useEffect } from 'react';
import { computeCached, useInsightsSources } from './useInsightsData';
import { notify } from './notify';
import { atTime, dayKey, rangeFor, startOfDay } from '@/src/viewmodels/insights/dates';
import { dayLoad } from '@/src/viewmodels/insights/metrics';
import { insightTasks } from './adapter';

const MORNING_KEY = 'dreda.notify.morning';
const EVENING_KEY = 'dreda.notify.evening';
const RED_KEY = 'dreda.notify.red';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked — it may repeat, which is harmless.
  }
}
function hours(minutes: number) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

export function InsightsNotifier() {
  const { uid, taskDocs, projectDocs, settings, minute, loading } = useInsightsSources();

  useEffect(() => {
    if (loading || !uid || !minute) return;
    const now = new Date(minute * 60000);
    const today = dayKey(now);
    const result = computeCached('today', taskDocs, projectDocs, settings, minute, 'today', null);
    const range = rangeFor('today', now);
    const tasks = insightTasks(taskDocs, range, now);
    // Everything on today's plan, whatever its state (cancelled aside).
    const planned = tasks.filter((t) => {
      const due = t.end ?? t.start;
      return t.status !== 'cancelled' && due !== null && due >= range.from && due <= range.to;
    });
    const workStart = atTime(now, settings.workStart);
    const workEnd = atTime(now, settings.workEnd);

    // Morning summary.
    if (settings.notifyMorning && now >= workStart && now < workEnd && read(MORNING_KEY) !== today) {
      write(MORNING_KEY, today);
      const load = dayLoad(tasks, startOfDay(now), settings);
      const count = planned.length;
      const reds = result.alerts.filter((a) => a.severity === 'red');
      notify(
        `Today: ${count} ${count === 1 ? 'task' : 'tasks'}, ${hours(load.scheduledMinutes)} scheduled`,
        reds.length ? `${reds.length} red ${reds.length === 1 ? 'alert' : 'alerts'}: ${reds[0].headline}` : 'Nothing at risk. Have a good day.',
        '/projects/insights',
        `morning-${today}`
      );
    }

    // Projects and milestones turning red.
    if (settings.notifyProjectRed) {
      const red = result.projects.filter((p) => p.risk === 'at risk' || p.risk === 'overdue');
      const known = read(RED_KEY);
      const before = new Set(known ? known.split(',') : []);
      const ids = red.map((p) => p.project.id);
      if (known !== null) {
        for (const stat of red) {
          if (before.has(stat.project.id)) continue;
          const missed = stat.milestones.find((m) => m.state === 'missed' || m.state === 'at risk');
          notify(
            missed ? `Milestone ${missed.state === 'missed' ? 'missed' : 'at risk'}: ${missed.milestone.name}` : `${stat.project.name} is at risk`,
            stat.reasons[0] ?? 'Open Insights to see why.',
            `/projects/insights/${stat.project.id}`,
            `red-${stat.project.id}`
          );
        }
      }
      write(RED_KEY, ids.join(','));
    }

    // Evening nudge.
    if (settings.notifyEvening && now >= workEnd && read(EVENING_KEY) !== today) {
      const all = planned;
      const done = all.filter((t) => t.status === 'done').length;
      const rate = all.length ? done / all.length : 1;
      write(EVENING_KEY, today);
      if (all.length && rate * 100 < settings.thresholds.eveningNudgePercent) {
        const left = all.length - done;
        notify(
          `${Math.round(rate * 100)}% of today's tasks done`,
          `${left} unfinished — tap to move them to tomorrow.`,
          '/tasks?filter=today',
          `evening-${today}`
        );
      }
    }
  }, [uid, taskDocs, projectDocs, settings, minute, loading]);

  return null;
}
