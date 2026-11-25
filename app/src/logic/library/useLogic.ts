"use client";

// Library (Design-System HANDOFF section 21): Resources and the Archive in
// one home. Archive stays `archived: true` (a project's status `Archived`) in
// place; nothing is deleted by archiving. Restore puts it back. Delete for
// good is offered only where a delete already exists (projects, and people
// while they are in memory), always behind a type-the-name confirmation.
// Resources are not stored yet. Delete for good: a project goes with its
// tasks or keeps them; a folder or an area either keeps what's inside (moved
// to the default folder, or unfiled) or deletes it too, as the person
// chooses (projectWrites.ts).

import { useMemo } from "react";
import { query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useProjectsDb } from "@/src/logic/projectsDb/useProjectsDb";
import { peopleStore, usePeople } from "@/src/logic/people/store";
import { useFirestoreCollection } from "@/src/shared/firestore/hooks";
import {
  deleteAreaForGood,
  deleteProject,
  deleteSectionForGood,
} from "@/src/shared/firestore/projectWrites";
import {
  areaRef,
  sectionRef,
  sectionsRef,
  taskRef,
} from "@/src/shared/firestore/refs";
import type { FirestoreSection } from "@/src/shared/firestore/types";

export type ArchivedKind = "Project" | "Folder" | "Task" | "Area" | "Person";

export interface ArchivedItem {
  key: string;
  kind: ArchivedKind;
  name: string;
  meta: string;
  restore: () => Promise<void> | void;
  /** Present only where a delete exists; `withContents` deletes what's inside too. */
  remove?: (withContents: boolean) => Promise<void> | void;
  /** What's inside (a project's tasks; a folder's or area's projects and tasks). */
  inside?: { projects: number; tasks: number };
}

export function useLogic() {
  const { db, rows, setStatus, loading } = useProjectsDb();
  const uid = db.uid;
  const people = usePeople();
  const { data: archivedSections, loading: sectionsLoading } =
    useFirestoreCollection<FirestoreSection>(
      useMemo(
        () =>
          uid ? query(sectionsRef(uid), where("archived", "==", true)) : null,
        [uid],
      ),
    );

  const archive = useMemo<ArchivedItem[]>(() => {
    if (!uid) return [];
    const areaName = (id: string | null) =>
      id ? (db.areas.get(id)?.name ?? null) : null;
    const projectName = (id: string | null) =>
      id ? (db.projects.get(id)?.name ?? null) : null;
    // What a place holds: its projects, and its tasks or those projects' tasks.
    const insideOf = (
      inPlace: (p: {
        areaId: string | null;
        bucketId?: string | null;
      }) => boolean,
    ) => {
      const projectIds = new Set(
        db.projectDocs.filter((p) => inPlace(p)).map((p) => p.id),
      );
      const tasks = db.taskDocs.filter(
        (t) =>
          inPlace(t) || (t.projectId !== null && projectIds.has(t.projectId)),
      ).length;
      return { projects: projectIds.size, tasks };
    };
    const items: ArchivedItem[] = [
      ...rows
        .filter((r) => r.status === "Archived")
        .map((r) => ({
          key: `p-${r.id}`,
          kind: "Project" as const,
          name: r.name,
          meta: [
            r.areaName,
            `${r.tasks} ${r.tasks === 1 ? "task" : "tasks"}${r.tasks && r.done === r.tasks ? ", all done" : ""}`,
          ]
            .filter(Boolean)
            .join(" · "),
          restore: () => setStatus(r, "Active"),
          remove: (withContents: boolean) =>
            deleteProject(uid, r.id, { deleteTasks: withContents }),
          inside: { projects: 0, tasks: r.tasks },
        })),
      ...archivedSections.map((s) => ({
        key: `f-${s.id}`,
        kind: "Folder" as const,
        name: s.name,
        meta: areaName(s.areaId) ?? "",
        restore: () =>
          updateDoc(sectionRef(uid, s.id), {
            archived: false,
            updatedAt: serverTimestamp(),
          }),
        remove: (withContents: boolean) =>
          deleteSectionForGood(uid, s.id, s.areaId, {
            deleteContents: withContents,
          }),
        inside: insideOf((p) => p.bucketId === s.id),
      })),
      ...db.areaDocs
        .filter((a) => a.archived)
        .map((a) => ({
          key: `a-${a.id}`,
          kind: "Area" as const,
          name: a.name,
          meta: a.description ?? "",
          restore: () =>
            updateDoc(areaRef(uid, a.id), {
              archived: false,
              updatedAt: serverTimestamp(),
            }),
          remove: (withContents: boolean) =>
            deleteAreaForGood(uid, a.id, { deleteContents: withContents }),
          inside: insideOf((p) => p.areaId === a.id),
        })),
      ...db.taskDocs
        .filter((t) => t.archived)
        .map((t) => ({
          key: `t-${t.id}`,
          kind: "Task" as const,
          name: t.title,
          meta: [areaName(t.areaId), projectName(t.projectId)]
            .filter(Boolean)
            .join(" / "),
          restore: () =>
            updateDoc(taskRef(uid, t.id), {
              archived: false,
              updatedAt: serverTimestamp(),
            }),
        })),
      ...people
        .filter((p) => p.archived)
        .map((p) => ({
          key: `h-${p.id}`,
          kind: "Person" as const,
          name: p.name,
          meta: p.category,
          restore: () => peopleStore.update(p.id, { archived: false }),
        })),
    ];
    return items;
  }, [
    uid,
    rows,
    archivedSections,
    db.areaDocs,
    db.taskDocs,
    db.projectDocs,
    db.areas,
    db.projects,
    people,
    setStatus,
  ]);

  return { archive, loading: loading || sectionsLoading };
}
