// Work (Design-System HANDOFF section 21): areas, the folders in them, the
// projects in those, and the tasks in those, as one tree with counts. A
// folder is what Firestore stores as a section (collection `sections`, field
// `bucketId` on projects and tasks); only the word changed. A project with no
// folder, or a stale one, lives in the area's default folder.
//
// Pure: built from the shared Projects database rows, the area and section
// documents, and the task documents.

import type { FirestoreArea, FirestoreSection, FirestoreTask } from '../shared/firestore/types';
import type { ProjectRow } from './projectRow';

export type WorkFilter = 'everything' | 'active' | 'week' | 'waiting' | 'archived';

export interface WorkProject {
  id: string;
  name: string;
  color: string;
  status: ProjectRow['status'];
  progress: number;
  openTasks: number;
  waiting: number;
  due: Date | null;
}

export interface WorkFolder {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  projects: WorkProject[];
  tasks: number;
  openTasks: number;
}

export interface WorkArea {
  id: string;
  name: string;
  color: string;
  initials: string;
  folders: WorkFolder[];
  projects: number;
  tasks: number;
  done: number;
  nextDue: Date | null;
}

export interface WorkTree {
  areas: WorkArea[];
  counts: Record<WorkFilter, number>;
  totals: { areas: number; folders: number; projects: number; tasks: number };
}

const DAY = 86_400_000;

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

function isOpen(t: FirestoreTask) {
  return !t.archived && !t.done && t.status !== 'Done' && t.status !== 'Cancelled';
}

function taskDue(t: FirestoreTask): Date | null {
  return t.dueDate?.toDate() ?? t.startTime?.toDate() ?? null;
}

export function defaultFolderId(areaId: string) {
  return `default-${areaId}`;
}

export function buildWorkTree({
  areas,
  sections,
  projects,
  tasks,
  filter,
  now,
}: {
  areas: FirestoreArea[];
  sections: FirestoreSection[];
  projects: ProjectRow[];
  tasks: FirestoreTask[];
  filter: WorkFilter;
  now: Date;
}): WorkTree {
  const weekEnd = new Date(now.getTime() + 7 * DAY);
  const liveTasks = tasks.filter((t) => !t.archived && !t.parentTaskId);
  const byProject = new Map<string, FirestoreTask[]>();
  for (const t of liveTasks) if (t.projectId) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);

  const keep = (p: ProjectRow) => {
    const own = byProject.get(p.id) ?? [];
    switch (filter) {
      case 'active':
        return p.status === 'Active';
      case 'archived':
        return p.status === 'Archived';
      case 'week':
        return p.status === 'Active' && own.some((t) => isOpen(t) && (taskDue(t)?.getTime() ?? Infinity) <= weekEnd.getTime());
      case 'waiting':
        return p.status === 'Active' && own.some((t) => isOpen(t) && t.status === 'Stuck');
      default:
        return p.status !== 'Archived';
    }
  };

  const toProject = (p: ProjectRow): WorkProject => {
    const own = byProject.get(p.id) ?? [];
    const open = own.filter(isOpen);
    const dues = open.map(taskDue).filter((d): d is Date => d !== null && d >= new Date(now.getTime() - DAY));
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      progress: p.progress,
      openTasks: open.length,
      waiting: open.filter((t) => t.status === 'Stuck').length,
      due: dues.sort((a, b) => a.getTime() - b.getTime())[0] ?? p.end,
    };
  };

  const liveAreas = areas.filter((a) => !a.archived).sort((a, b) => a.name.localeCompare(b.name));
  const tree: WorkArea[] = liveAreas.map((area) => {
    const areaSections = sections.filter((s) => s.areaId === area.id && !s.archived);
    const known = new Set(areaSections.map((s) => s.id));
    const areaProjects = projects.filter((p) => p.areaId === area.id && keep(p));
    const folderOf = (p: ProjectRow) => (p.folderId && known.has(p.folderId) ? p.folderId : defaultFolderId(area.id));
    const folders: WorkFolder[] = areaSections
      .map((s) => {
        const mine = areaProjects.filter((p) => folderOf(p) === s.id).map(toProject);
        const folderTasks = liveTasks.filter((t) => t.areaId === area.id && (t.bucketId && known.has(t.bucketId) ? t.bucketId : defaultFolderId(area.id)) === s.id);
        return {
          id: s.id,
          name: s.name,
          color: s.color || area.color,
          isDefault: Boolean(s.isDefault) || s.id === defaultFolderId(area.id),
          projects: mine,
          tasks: folderTasks.length,
          openTasks: folderTasks.filter(isOpen).length,
        };
      })
      // The default folder only shows when something is filed in it.
      .filter((f) => !f.isDefault || f.projects.length > 0 || f.openTasks > 0)
      .sort((a, b) => Number(a.isDefault) - Number(b.isDefault) || a.name.localeCompare(b.name));
    const areaTasks = liveTasks.filter((t) => t.areaId === area.id);
    const nextDue = areaTasks
      .filter(isOpen)
      .map(taskDue)
      .filter((d): d is Date => d !== null && d >= new Date(now.getTime() - DAY))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: area.id,
      name: area.name,
      color: area.color,
      initials: initials(area.name),
      folders,
      projects: areaProjects.length,
      tasks: areaTasks.length,
      done: areaTasks.filter((t) => t.done || t.status === 'Done').length,
      nextDue,
    };
  });

  const count = (f: WorkFilter) => {
    if (f === 'everything') return liveTasks.length;
    if (f === 'active') return projects.filter((p) => p.status === 'Active').length;
    if (f === 'archived') return projects.filter((p) => p.status === 'Archived').length;
    if (f === 'week') return liveTasks.filter((t) => isOpen(t) && (taskDue(t)?.getTime() ?? Infinity) <= weekEnd.getTime()).length;
    return liveTasks.filter((t) => isOpen(t) && t.status === 'Stuck').length;
  };

  return {
    areas: filter === 'everything' ? tree : tree.filter((a) => a.projects > 0),
    counts: { everything: count('everything'), active: count('active'), week: count('week'), waiting: count('waiting'), archived: count('archived') },
    totals: {
      areas: liveAreas.length,
      folders: tree.reduce((n, a) => n + a.folders.length, 0),
      projects: projects.filter((p) => p.status !== 'Archived').length,
      tasks: liveTasks.length,
    },
  };
}

// ---------------------------------------------------------------------------
// An area page or a folder page: the same shape, a different scope. Answers
// "what is in here": four tiles, the folders (area only), the projects, and
// the tasks next up.

export interface ScopeTask {
  id: string;
  title: string;
  where: string;
  when: Date | null;
  minutes: number | null;
  waiting: boolean;
  quadrant: string | null;
}

export interface ScopeProject extends WorkProject {
  folderName: string | null;
  done: number;
  tasks: number;
}

export interface ScopeSummary {
  tiles: { openTasks: number; dueThisWeek: number; waiting: number; blockedMinutes: number };
  folders: (WorkFolder & { done: number; total: number; nextDue: Date | null })[];
  projects: ScopeProject[];
  tasks: ScopeTask[];
  counts: { folders: number; projects: number; tasks: number; archived: number; donePct: number };
}

function startOfWeek(now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function scopeSummary({
  scope,
  areaId,
  folderId,
  sections,
  projects,
  tasks,
  now,
}: {
  scope: 'area' | 'folder';
  areaId: string;
  folderId?: string;
  sections: FirestoreSection[];
  projects: ProjectRow[];
  tasks: FirestoreTask[];
  now: Date;
}): ScopeSummary {
  const areaSections = sections.filter((s) => s.areaId === areaId && !s.archived);
  const known = new Set(areaSections.map((s) => s.id));
  const folderOfProject = (p: ProjectRow) => (p.folderId && known.has(p.folderId) ? p.folderId : defaultFolderId(areaId));
  const folderOfTask = (t: FirestoreTask) => (t.bucketId && known.has(t.bucketId) ? t.bucketId : defaultFolderId(areaId));
  const inScopeProject = (p: ProjectRow) => p.areaId === areaId && (scope === 'area' || folderOfProject(p) === folderId);
  const inScopeTask = (t: FirestoreTask) => t.areaId === areaId && (scope === 'area' || folderOfTask(t) === folderId);

  const allTasks = tasks.filter((t) => !t.parentTaskId && inScopeTask(t));
  const live = allTasks.filter((t) => !t.archived);
  const open = live.filter(isOpen);
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
  const blockedMinutes = live.reduce((sum, t) => {
    // A block is a timed range: startTime to dueDate, not all day.
    const start = t.startTime?.toDate();
    const end = t.startTime ? t.dueDate?.toDate() : undefined;
    if (t.allDay || !start || !end || end <= weekStart || start >= weekEnd) return sum;
    return sum + Math.max(0, (Math.min(end.getTime(), weekEnd.getTime()) - Math.max(start.getTime(), weekStart.getTime())) / 60000);
  }, 0);

  const sectionName = new Map(areaSections.map((s) => [s.id, s.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const scopedProjects = projects.filter((p) => inScopeProject(p) && p.status !== 'Archived');

  const byProject = new Map<string, FirestoreTask[]>();
  for (const t of live) if (t.projectId) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);

  const projectRows: ScopeProject[] = scopedProjects.map((p) => {
    const own = byProject.get(p.id) ?? [];
    const ownOpen = own.filter(isOpen);
    const dues = ownOpen.map(taskDue).filter((d): d is Date => d !== null);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      progress: p.progress,
      openTasks: ownOpen.length,
      waiting: ownOpen.filter((t) => t.status === 'Stuck').length,
      due: dues.sort((a, b) => a.getTime() - b.getTime())[0] ?? p.end,
      folderName: sectionName.get(folderOfProject(p)) ?? null,
      done: own.length - ownOpen.length,
      tasks: own.length,
    };
  });

  const folders =
    scope === 'area'
      ? areaSections
          .map((s) => {
            const fTasks = live.filter((t) => folderOfTask(t) === s.id);
            const fOpen = fTasks.filter(isOpen);
            return {
              id: s.id,
              name: s.name,
              color: s.color,
              isDefault: Boolean(s.isDefault) || s.id === defaultFolderId(areaId),
              projects: projectRows.filter((p) => scopedProjects.find((x) => x.id === p.id && folderOfProject(x) === s.id)),
              tasks: fTasks.length,
              openTasks: fOpen.length,
              done: fTasks.length - fOpen.length,
              total: fTasks.length,
              nextDue: fOpen.map(taskDue).filter((d): d is Date => d !== null && d >= new Date(now.getTime() - DAY)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
            };
          })
          .filter((f) => !f.isDefault || f.projects.length > 0 || f.openTasks > 0)
      : [];

  const nextUp = open
    .map((t) => {
      const start = t.startTime?.toDate() ?? null;
      const end = start && !t.allDay ? (t.dueDate?.toDate() ?? null) : null;
      return {
        id: t.id,
        title: t.title,
        where: [sectionName.get(folderOfTask(t)), t.projectId ? projectName.get(t.projectId) : null].filter(Boolean).join(' · '),
        when: taskDue(t),
        minutes: start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null,
        waiting: t.status === 'Stuck',
        quadrant: t.quadrant ?? null,
      };
    })
    .sort((a, b) => (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity));

  const doneCount = live.length - open.length;
  return {
    tiles: {
      openTasks: open.length,
      dueThisWeek: open.filter((t) => (taskDue(t)?.getTime() ?? Infinity) < weekEnd.getTime()).length,
      waiting: open.filter((t) => t.status === 'Stuck').length,
      blockedMinutes: Math.round(blockedMinutes),
    },
    folders,
    projects: projectRows,
    tasks: nextUp,
    counts: {
      folders: folders.length,
      projects: projectRows.length,
      tasks: live.length,
      archived: allTasks.filter((t) => t.archived).length + projects.filter((p) => inScopeProject(p) && p.status === 'Archived').length,
      donePct: live.length ? Math.round((doneCount / live.length) * 100) : 0,
    },
  };
}
