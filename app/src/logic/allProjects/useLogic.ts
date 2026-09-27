'use client';

// "See all projects" — reached from the Projects hub's Projects section
// (see src/screens/Projects/ProjectsScreen.tsx). Filtered, sorted and
// searched by the Notion-style toolbar (src/widgets/ListQuery), saved per
// user; default: active projects, at-risk first, then by deadline.
// Progress, overdue tasks and health come from Insights' project stats
// (src/viewmodels/insights/metrics.ts). Each row carries the same fields the
// hub's own ProjectCard (src/widgets/ProjectCard) shows — name, timeline,
// description, section, area — just laid out for a full-width vertical
// list instead of a fixed-width carousel card.
//
// Archiving here is the same status:'Archived' write projectEdit/
// useLogic.ts's own archiveProject makes, just without that hook's
// redirect-after-archive (this list stays put and the live query drops
// the row the instant it archives).

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { areasRef, projectRef, projectsRef } from '@/src/shared/firestore/refs';
import { defaultSectionId } from '@/src/shared/firestore/sections';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreArea, FirestoreProject } from '@/src/shared/firestore/types';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { tasksByProject, toInsightProject } from '@/src/shared/insights/adapter';
import { projectStat } from '@/src/viewmodels/insights/metrics';
import { DEFAULT_THRESHOLDS } from '@/src/viewmodels/insights/settings';
import { useListQuery } from '@/src/shared/listQuery/useListQuery';
import { applyQuery, type FieldDef, type ListQuery } from '@/src/shared/listQuery/engine';

export interface ProjectListItem {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  areaId: string | null;
  areaName: string | null;
  bucketName: string | null;
  status: 'active' | 'completed' | 'archived';
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  taskCount: number;
  overdue: number;
  health: 'at risk' | 'watch' | 'on track';
  createdAt: Date | null;
}

/** Active projects, at risk first, then by deadline. */
export const PROJECT_DEFAULTS: ListQuery = {
  filters: [{ id: 'default-status', kind: 'rule', field: 'status', op: 'is', value: ['active'] }],
  advanced: null,
  sorts: [
    { id: 'default-health', field: 'health', dir: 'asc' },
    { id: 'default-deadline', field: 'deadline', dir: 'asc' },
  ],
  search: '',
};

export function projectFields(areas: { id: string; name: string }[]): FieldDef<ProjectListItem>[] {
  return [
    { id: 'name', label: 'Name', type: 'text', get: (p) => p.name, searchable: true },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      get: (p) => p.status,
      options: [
        { value: 'active', label: 'Active', color: '#3b63f0' },
        { value: 'completed', label: 'Completed', color: '#2fa36b' },
        { value: 'archived', label: 'Archived', color: '#8b90a0' },
      ],
    },
    { id: 'progress', label: 'Progress %', type: 'number', get: (p) => p.progress },
    { id: 'deadline', label: 'Deadline', type: 'date', get: (p) => p.endDate },
    { id: 'start', label: 'Start date', type: 'date', get: (p) => p.startDate },
    { id: 'tasks', label: 'Task count', type: 'number', get: (p) => p.taskCount },
    { id: 'overdue', label: 'Overdue tasks', type: 'number', get: (p) => p.overdue },
    {
      // Sorts at risk first.
      id: 'health',
      label: 'Health',
      type: 'select',
      get: (p) => p.health,
      options: [
        { value: 'at risk', label: 'At risk', color: '#e04b5a' },
        { value: 'watch', label: 'Watch', color: '#d98a1c' },
        { value: 'on track', label: 'On track', color: '#2fa36b' },
      ],
    },
    {
      id: 'area',
      label: 'Area',
      type: 'select',
      get: (p) => p.areaId,
      options: [...areas].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ value: a.id, label: a.name })),
    },
    { id: 'created', label: 'Created', type: 'date', get: (p) => p.createdAt },
    { id: 'description', label: 'Description', type: 'text', get: (p) => p.description, searchable: true, filterable: false, sortable: false },
  ];
}
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading, error: projectsError } =
    useFirestoreCollection<FirestoreProject>(projectsQuery);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs, loading: bucketsLoading } = useSections();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const { data: taskDocs, loading: tasksLoading } = useAllTasks();

  const items = useMemo<ProjectListItem[]>(() => {
    const now = new Date();
    const tasks = tasksByProject(taskDocs, now);
    return projectDocs.map((project) => {
      const stat = projectStat(toInsightProject(project), tasks.get(project.id) ?? [], now, DEFAULT_THRESHOLDS);
          // A project's bucketId falls back to its own area's default
          // section when unset — same rule the Projects hub's own logic
          // (src/logic/projects/useLogic.ts) and areaDetail/useLogic.ts
          // both apply.
      const resolvedBucketId = project.bucketId ?? (project.areaId ? defaultSectionId(project.areaId) : null);
      return {
        id: project.id,
        name: project.name,
        emoji: project.emoji ?? null,
        color: project.color,
        description: project.description,
        areaId: project.areaId ?? null,
        areaName: project.areaId ? areaName.get(project.areaId) ?? null : null,
        bucketName: resolvedBucketId ? bucketName.get(resolvedBucketId) ?? null : null,
        status: project.status === 'Completed' ? 'completed' : project.status === 'Archived' ? 'archived' : 'active',
        startDate: project.startDate ? project.startDate.toDate() : null,
        endDate: project.endDate ? project.endDate.toDate() : null,
        progress: Math.round(stat.progress * 100),
        taskCount: stat.total,
        overdue: stat.overdue,
        health: stat.risk === 'overdue' || stat.risk === 'at risk' ? 'at risk' : stat.risk === 'watch' ? 'watch' : 'on track',
        createdAt: project.createdAt ? project.createdAt.toDate() : null,
      };
    });
  }, [projectDocs, taskDocs, areaName, bucketName]);

  const fields = useMemo(() => projectFields(areaDocs.map((a) => ({ id: a.id, name: a.name }))), [areaDocs]);
  const list = useListQuery<ProjectListItem>({ listId: 'projects', fields, defaults: PROJECT_DEFAULTS });
  const projects = useMemo(() => applyQuery(items, list.query, fields, new Date()), [items, list.query, fields]);

  function openProject(id: string) {
    router.push(`/projects/${id}`);
  }

  // Back to the page the user came from (skipping forms); '/projects' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/projects');
  }

  async function archiveProject(id: string) {
    if (!uid) return;
    await updateDoc(projectRef(uid, id), { status: 'Archived', updatedAt: serverTimestamp() });
  }

  return {
    projects,
    total: items.length,
    fields,
    list,
    openProject,
    archiveProject,
    goBack,
    loading: projectsLoading || areasLoading || bucketsLoading || tasksLoading,
    error: projectsError,
  };
}
