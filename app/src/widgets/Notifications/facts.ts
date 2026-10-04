// Facts for the notification rules (src/shared/notifications/rules.ts),
// gathered from the same pure modules the pages use, so a notification
// always agrees with what its page shows. Pure.

import type { FactLine, MoneyFacts, TimeFacts } from '@/src/shared/notifications/rules';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import type { FlowType } from '@/src/shared/budget/flow';
import { promptFor, unexplained } from '@/src/viewmodels/planning';
import { addDays, atTime, dayKey, relativeDayName, startOfDay } from '@/src/viewmodels/insights/dates';
import { currentStreak, dayLoad, dueAt, overdueTasks, quadrantMix } from '@/src/viewmodels/insights/metrics';
import type { ProjectStat } from '@/src/viewmodels/insights/metrics';
import type { InsightsSettings } from '@/src/viewmodels/insights/settings';
import type { InsightTask } from '@/src/viewmodels/insights/types';

/** The month's lines, overspends, leftovers and savings behind, from the Budget page's rows. */
export function budgetFacts(rows: Record<FlowType, LineRow[]>, month: string, today: Date) {
  const all = [...rows.Expense, ...rows.Savings, ...rows.Income, ...rows.Transfer].filter((r) => !r.archived);
  const lines: FactLine[] = all.map((r) => ({
    key: r.key,
    bucketId: r.bucketId,
    itemId: r.itemId,
    name: r.name,
    type: r.type,
    state: r.state,
    left: r.left,
    due: r.due,
    necessity: r.necessity,
    closed: r.closed,
  }));
  const overspends = [...rows.Expense, ...rows.Savings]
    .filter((r) => !r.archived && unexplained(r) > 0)
    .map((r) => ({ key: r.key, bucketId: r.bucketId, itemId: r.itemId, name: r.name, amount: unexplained(r) }));
  const byBucket = new Map<string, LineRow[]>();
  for (const r of [...rows.Expense, ...rows.Savings]) byBucket.set(r.bucketId, [...(byBucket.get(r.bucketId) ?? []), r]);
  const leftovers: MoneyFacts['leftovers'] = [];
  for (const [bucketId, items] of byBucket) {
    const p = promptFor(items, { month, today });
    if (p?.kind === 'leftover') leftovers.push({ bucketId, name: items[0].bucketName, amount: p.amount });
  }
  const savingsBehind = rows.Savings.filter((r) => !r.archived && !r.closed && r.state === 'Overdue' && r.left > 0).map((r) => ({ key: r.key, bucketId: r.bucketId, name: r.name, short: r.left }));
  // Savings past their date are "behind", not an overdue payment.
  return { lines: lines.filter((l) => !(l.type === 'Savings' && l.state === 'Overdue')), overspends, leftovers, savingsBehind };
}

const hours = (minutes: number) => {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
};

/** Time facts: overdue and due-today tasks, projects and milestones, the week's load, streaks, and the two daily messages. */
export function timeFacts(input: {
  tasks: InsightTask[];
  projects: ProjectStat[];
  settings: InsightsSettings;
  now: Date;
  /** "08:00" (Settings > Notifications); else the start of working hours. */
  summaryTime: string | null;
  conflicts: TimeFacts['conflicts'];
}): TimeFacts {
  const { tasks, projects, settings, now } = input;
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const open = tasks.filter((t) => t.status === 'pending');
  const overdue = overdueTasks(tasks, now).map((t) => ({ id: t.seriesId ?? t.id, title: t.title, due: dueAt(t) as Date, doFirst: t.quadrant === 'do' }));
  const dueToday = open
    .filter((t) => {
      const d = dueAt(t);
      return d !== null && d >= now && d < tomorrow;
    })
    .map((t) => ({ id: t.seriesId ?? t.id, title: t.title, due: dueAt(t) as Date }));

  const atRisk = projects.filter((p) => p.risk === 'at risk' || p.risk === 'overdue');
  const milestones = atRisk.flatMap((p) =>
    p.milestones.filter((m) => m.state === 'missed' || m.state === 'at risk').map((m) => ({ id: m.milestone.id, projectId: p.project.id, name: m.milestone.name, state: m.state as 'missed' | 'at risk' }))
  );

  const capacity = settings.capacityHours * 60;
  const days: TimeFacts['days'] = [];
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i);
    const load = dayLoad(tasks, day, settings);
    if (load.scheduledMinutes > capacity) days.push({ key: load.key, date: day, label: relativeDayName(day, now), scheduledMinutes: load.scheduledMinutes, capacityMinutes: capacity });
  }

  const week = { from: addDays(today, -6), to: now };
  const mix = quadrantMix(tasks, week);
  const doFirstHeavy = mix.firefighting !== null && mix.firefighting * 100 > settings.thresholds.firefightingWatchPercent ? { share: mix.firefighting } : null;

  const t = settings.thresholds;
  const yesterday = addDays(today, -1);
  const before = currentStreak(tasks, addDays(yesterday, -1), t.streakPercent);
  const current = currentStreak(tasks, now, t.streakPercent);
  const yTasks = tasks.filter((x) => x.status !== 'cancelled' && dueAt(x) && dayKey(dueAt(x) as Date) === dayKey(yesterday));
  const yRatio = yTasks.length ? yTasks.filter((x) => x.status === 'done').length / yTasks.length : 1;
  const streakBroken = before >= 2 && yRatio * 100 < t.streakPercent && current === 0 ? { days: before } : null;

  // The two daily messages, inside their windows.
  const planned = tasks.filter((x) => {
    const d = dueAt(x);
    return x.status !== 'cancelled' && d !== null && d >= today && d < tomorrow;
  });
  const workEnd = atTime(now, settings.workEnd);
  const morningAt = atTime(now, input.summaryTime ?? settings.workStart);
  let morning: TimeFacts['morning'] = null;
  if (settings.notifyMorning && now >= morningAt && now < workEnd) {
    const load = dayLoad(tasks, today, settings);
    morning = {
      day: dayKey(now),
      title: `Today: ${planned.length} ${planned.length === 1 ? 'task' : 'tasks'}, ${hours(load.scheduledMinutes)} scheduled`,
      body: atRisk.length ? `${atRisk.length} ${atRisk.length === 1 ? 'project needs' : 'projects need'} attention.` : 'Nothing at risk. Have a good day.',
    };
  }
  let evening: TimeFacts['evening'] = null;
  if (settings.notifyEvening && now >= workEnd && planned.length) {
    const done = planned.filter((x) => x.status === 'done').length;
    const rate = done / planned.length;
    if (rate * 100 < t.eveningNudgePercent) {
      evening = { day: dayKey(now), title: `${Math.round(rate * 100)}% of today's tasks done`, body: `${planned.length - done} unfinished. Move them to tomorrow in one tap.` };
    }
  }

  return {
    overdueTasks: overdue,
    overdueUrgentCount: t.overdueRedCount,
    dueToday,
    projects: atRisk.map((p) => ({ id: p.project.id, name: p.project.name, risk: p.risk as 'at risk' | 'overdue', reason: p.reasons[0] ?? '' })),
    milestones,
    days,
    doFirstHeavy,
    conflicts: input.conflicts,
    streakBroken,
    morning,
    evening,
  };
}
