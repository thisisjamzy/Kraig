'use client';

// The data behind Time v1.0's Organise pages (Projects, Areas, Folders and
// their detail pages, phone and web): every area, folder and project with
// its counts (viewmodels/organise.ts), and their tasks as list rows
// (viewmodels/taskListItem.ts). Each page's hook reads from here.

import { useMemo } from 'react';
import { useProjectsDb } from '@/src/logic/projectsDb/useProjectsDb';
import { useSections } from '@/src/shared/firestore/queries';
import { updateTaskDone } from '@/src/shared/firestore/taskWrites';
import { actionableTasks, expandTasks, type TaskItem } from '@/src/shared/tasks/recurringTasks';
import { organise, weekBounds } from '@/src/viewmodels/organise';
import { toListItem, type TaskListItem } from '@/src/viewmodels/taskListItem';
import type { Priority } from '@/src/shared/firestore/types';

export function useOrganise() {
  const projectsDb = useProjectsDb();
  const { db, rows } = projectsDb;
  const { data: sections, loading: sectionsLoading } = useSections();

  const tasks = useMemo<TaskItem[]>(() => actionableTasks(db.taskDocs, new Date(), { includeUpcoming: true }).filter((t) => !t.archived), [db.taskDocs]);

  const organised = useMemo(() => {
    const now = new Date();
    const { from, to } = weekBounds(now);
    return organise({
      areas: db.areaDocs,
      sections,
      rows,
      priorities: new Map<string, Priority>(db.projectDocs.map((p) => [p.id, p.priority ?? 'Medium'])),
      tasks,
      week: expandTasks(db.taskDocs, from, new Date(to.getTime() - 1)),
      now,
    });
  }, [db.areaDocs, db.projectDocs, db.taskDocs, sections, rows, tasks]);

  const listCtx = useMemo(
    () => ({
      projects: db.projects,
      projectName: new Map(db.projectDocs.map((p) => [p.id, p.name])),
      bucketName: new Map(sections.map((s) => [s.id, s.name])),
      areaName: new Map(db.areaDocs.map((a) => [a.id, a.name])),
    }),
    [db.projects, db.projectDocs, db.areaDocs, sections]
  );

  /** Tasks in some projects as list rows, by date (undated last). */
  function tasksIn(projectIds: Set<string>): TaskListItem[] {
    const now = new Date();
    return tasks
      .filter((t) => t.projectId && projectIds.has(t.projectId) && t.status !== 'Cancelled')
      .map((t) => toListItem(t, listCtx, now))
      .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.anchor?.getTime() ?? Infinity) - (b.anchor?.getTime() ?? Infinity));
  }

  return {
    ...organised,
    rows,
    db,
    sections,
    tasksIn,
    setDates: projectsDb.setDates,
    setStatus: projectsDb.setStatus,
    setDone: (t: Pick<TaskListItem, 'id'>, done: boolean) => (db.uid ? updateTaskDone(db.uid, t.id, done) : Promise.resolve()),
    loading: projectsDb.loading || sectionsLoading,
  };
}

export type OrganiseLogic = ReturnType<typeof useOrganise>;
