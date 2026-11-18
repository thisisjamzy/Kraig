// Time v1.0's Organise pages (Projects, Areas, Folders and their detail
// pages; Dreda v1.0 frames 57627 to 64838): each area, folder and project
// with what its cards, tables and stat cards show. A folder is what
// Firestore stores as a section; a project with no folder, or a stale one,
// sits in its area's default folder (viewmodels/work.ts).
//
// "Blocked" is time booked on the calendar this week: timed, blocked (not
// free) tasks from Monday to Sunday. Pure, tested in test/timePages.test.ts.

import type { FirestoreArea, FirestoreSection, Priority } from '@/src/shared/firestore/types';
import type { TaskItem } from '@/src/shared/tasks/recurringTasks';
import { effectiveTimeMode } from './scheduling';
import { labelHue, type LabelHue } from './projects';
import type { ProjectHealth, ProjectRow } from './projectRow';
import { defaultFolderId } from './work';

export type ProjectStage = 'Planned' | 'In progress' | 'At risk' | 'Done';
export const STAGE_ORDER: ProjectStage[] = ['Planned', 'In progress', 'At risk', 'Done'];

export interface NextUp {
  id: string;
  title: string;
  date: Date | null;
  projectId: string | null;
  overdue: boolean;
}

interface Counts {
  /** Every task, done included (recurring dates as listed). */
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** Open tasks due from today to the end of Sunday. */
  dueWeek: number;
  dueToday: number;
  /** Time booked on the calendar this week, in minutes. */
  weekMinutes: number;
  /** 0 to 1. */
  progress: number;
}

export interface ProjectStat extends Counts {
  id: string;
  name: string;
  description: string;
  hue: LabelHue;
  /** The letter on its tile ("D"). */
  letter: string;
  areaId: string | null;
  areaName: string | null;
  folderId: string | null;
  folderName: string | null;
  status: ProjectRow['status'];
  health: ProjectHealth;
  stage: ProjectStage;
  priority: Priority;
  /** "High priority" */
  priorityText: string;
  start: Date | null;
  end: Date | null;
  nextUp: NextUp | null;
}

export interface FolderStat extends Counts {
  id: string;
  name: string;
  description: string;
  hue: LabelHue;
  areaId: string;
  areaName: string;
  isDefault: boolean;
  projects: ProjectStat[];
}

export interface AreaStat extends Counts {
  id: string;
  name: string;
  description: string;
  hue: LabelHue;
  weeklyHours: number | null;
  folders: FolderStat[];
  projects: ProjectStat[];
}

export interface Organised {
  areas: AreaStat[];
  folders: FolderStat[];
  projects: ProjectStat[];
  nextUp: (scope: { areaId?: string; folderId?: string; projectId?: string }, count?: number) => NextUp[];
}

const DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday 00:00 of the week `d` is in, and the Monday after. */
export function weekBounds(d: Date): { from: Date; to: Date } {
  const from = startOfDay(d);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) };
}

function isDone(t: TaskItem) {
  return t.done || t.status === 'Done';
}

function isOpen(t: TaskItem) {
  return !t.archived && !isDone(t) && t.status !== 'Cancelled';
}

function due(t: TaskItem): Date | null {
  return t.dueDate?.toDate() ?? t.startTime?.toDate() ?? null;
}

/** Minutes a timed, blocked task books inside [from, to). */
export function bookedMinutes(t: TaskItem, from: Date, to: Date): number {
  if (t.archived || t.allDay || t.status === 'Cancelled' || effectiveTimeMode(t) !== 'blocked') return 0;
  const s = t.startTime?.toDate();
  const e = t.dueDate?.toDate();
  if (!s || !e || e <= s) return 0;
  const a = Math.max(s.getTime(), from.getTime());
  const b = Math.min(e.getTime(), to.getTime());
  return b > a ? Math.round((b - a) / 60000) : 0;
}

export function stageOf(p: Pick<ProjectStat, 'status' | 'health' | 'done' | 'start'>, now: Date): ProjectStage {
  if (p.status === 'Completed' || p.health === 'Done') return 'Done';
  if (p.health === 'At risk') return 'At risk';
  if (p.done === 0 && (!p.start || p.start > now)) return 'Planned';
  return 'In progress';
}

function counts(tasks: TaskItem[], week: TaskItem[], now: Date): Counts {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const { from, to } = weekBounds(now);
  const live = tasks.filter((t) => !t.archived && t.status !== 'Cancelled');
  const open = live.filter(isOpen);
  const done = live.filter(isDone).length;
  return {
    total: live.length,
    done,
    open: open.length,
    overdue: open.filter((t) => {
      const d = due(t);
      return d !== null && d < today;
    }).length,
    dueWeek: open.filter((t) => {
      const d = due(t);
      return d !== null && d >= today && d < to;
    }).length,
    dueToday: open.filter((t) => {
      const d = due(t);
      return d !== null && d >= today && d < tomorrow;
    }).length,
    weekMinutes: week.reduce((s, t) => s + bookedMinutes(t, from, to), 0),
    progress: live.length ? done / live.length : 0,
  };
}

function sum(parts: Counts[]): Counts {
  const total = parts.reduce((s, c) => s + c.total, 0);
  const done = parts.reduce((s, c) => s + c.done, 0);
  const add = (k: keyof Counts) => parts.reduce((s, c) => s + c[k], 0);
  return { total, done, open: add('open'), overdue: add('overdue'), dueWeek: add('dueWeek'), dueToday: add('dueToday'), weekMinutes: add('weekMinutes'), progress: total ? done / total : 0 };
}

function nextOf(tasks: TaskItem[], now: Date): NextUp[] {
  const today = startOfDay(now);
  return tasks
    .filter(isOpen)
    .sort((a, b) => (due(a)?.getTime() ?? Infinity) - (due(b)?.getTime() ?? Infinity))
    .map((t) => {
      const d = due(t);
      return { id: t.id, title: t.title, date: d, projectId: t.projectId, overdue: d !== null && d < today };
    });
}

/**
 * `tasks`: the task list as the lists show it (one-off tasks, and each
 * series' recent and next dates: recurringTasks.actionableTasks).
 * `week`: every task date in this week (recurringTasks.expandTasks).
 */
export function organise({
  areas,
  sections,
  rows,
  priorities,
  tasks,
  week,
  now,
}: {
  areas: FirestoreArea[];
  sections: FirestoreSection[];
  rows: ProjectRow[];
  priorities: Map<string, Priority>;
  tasks: TaskItem[];
  week: TaskItem[];
  now: Date;
}): Organised {
  const liveAreas = areas.filter((a) => !a.archived).sort((a, b) => a.name.localeCompare(b.name));
  const liveSections = sections.filter((s) => !s.archived);
  const sectionById = new Map(liveSections.map((s) => [s.id, s]));
  const byProject = new Map<string, TaskItem[]>();
  const weekByProject = new Map<string, TaskItem[]>();
  for (const t of tasks) if (t.projectId && !t.parentTaskId) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);
  for (const t of week) if (t.projectId && !t.parentTaskId) weekByProject.set(t.projectId, [...(weekByProject.get(t.projectId) ?? []), t]);

  const folderOf = (areaId: string | null, folderId: string | null) => {
    if (!areaId) return null;
    const s = folderId ? sectionById.get(folderId) : undefined;
    return s && s.areaId === areaId ? s.id : defaultFolderId(areaId);
  };

  const projects: ProjectStat[] = rows
    .filter((r) => r.status !== 'Archived')
    .map((r) => {
      const own = byProject.get(r.id) ?? [];
      const c = counts(own, weekByProject.get(r.id) ?? [], now);
      const folderId = folderOf(r.areaId, r.folderId);
      const folder = folderId ? sectionById.get(folderId) : undefined;
      const priority = priorities.get(r.id) ?? 'Medium';
      const base = {
        ...c,
        id: r.id,
        name: r.name,
        description: r.description,
        hue: labelHue(r.color),
        letter: (r.name.trim()[0] ?? '?').toUpperCase(),
        areaId: r.areaId,
        areaName: r.areaName,
        folderId,
        folderName: folder && !folder.isDefault && folder.id !== defaultFolderId(folder.areaId) ? folder.name : null,
        status: r.status,
        health: r.health,
        priority,
        priorityText: `${priority} priority`,
        start: r.start,
        end: r.end,
        nextUp: nextOf(own, now)[0] ?? null,
      };
      return { ...base, stage: stageOf(base, now) };
    })
    .sort((a, b) => (a.end?.getTime() ?? Infinity) - (b.end?.getTime() ?? Infinity) || a.name.localeCompare(b.name));

  const folders: FolderStat[] = [];
  const areaStats: AreaStat[] = liveAreas.map((area) => {
    const areaProjects = projects.filter((p) => p.areaId === area.id);
    const own: FolderStat[] = liveSections
      .filter((s) => s.areaId === area.id)
      .map((s) => {
        const id = s.id;
        const ps = areaProjects.filter((p) => p.folderId === id);
        const isDefault = Boolean(s.isDefault) || id === defaultFolderId(area.id);
        return {
          ...sum(ps),
          id,
          name: s.name,
          description: s.description ?? '',
          hue: labelHue(s.color || area.color),
          areaId: area.id,
          areaName: area.name,
          isDefault,
          projects: ps,
        };
      })
      // The default folder only shows when something is filed in it.
      .filter((f) => !f.isDefault || f.projects.length > 0)
      .sort((a, b) => Number(a.isDefault) - Number(b.isDefault) || a.name.localeCompare(b.name));
    folders.push(...own);
    return {
      ...sum(areaProjects),
      id: area.id,
      name: area.name,
      description: area.description ?? '',
      hue: labelHue(area.color),
      weeklyHours: area.weeklyHoursTarget ?? null,
      folders: own,
      projects: areaProjects,
    };
  });

  const projectIn = new Map(projects.map((p) => [p.id, p]));
  return {
    areas: areaStats,
    folders,
    projects,
    nextUp: (scope, count = 5) =>
      nextOf(
        tasks.filter((t) => {
          if (!t.projectId) return false;
          const p = projectIn.get(t.projectId);
          if (!p) return false;
          if (scope.projectId) return p.id === scope.projectId;
          if (scope.folderId) return p.folderId === scope.folderId;
          if (scope.areaId) return p.areaId === scope.areaId;
          return true;
        }),
        now
      ).slice(0, count),
  };
}

/** "2 folders", "1 project". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Area a project sits in, then its folder: "Work › Dreda app". */
export function crumbOf(p: Pick<ProjectStat, 'areaName' | 'folderName'>): string {
  return [p.areaName, p.folderName].filter(Boolean).join(' › ');
}


const HUE_NAME: Record<LabelHue, string> = { purple: 'Purple', blue: 'Blue', teal: 'Teal', green: 'Green', lime: 'Lime', amber: 'Amber', orange: 'Orange', rose: 'Rose', grey: 'Grey' };

/** "Purple": the hue's name, for About. */
export function hueName(hue: LabelHue): string {
  return HUE_NAME[hue];
}
