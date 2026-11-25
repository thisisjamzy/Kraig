"use client";

// Deleting a project for good (archiving is still the reversible option —
// status 'Archived'). Its milestones live on the project doc and go with
// it. Its tasks (subtasks included — they carry the same projectId) are
// either deleted too, or kept as standalone tasks: projectId, and the
// areaId/bucketId mirrored from the project, cleared.

import {
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/src/shared/config/firebaseClient";
import { DEFAULT_PRIORITY } from "@/src/viewmodels/projects";
import {
  areaRef,
  projectRef,
  projectsRef,
  sectionRef,
  sectionsRef,
  tasksRef,
} from "./refs";
import { guardWrite } from "./writeGuard";

// Firestore caps a batch at 500 writes.
const BATCH_LIMIT = 450;

export async function countProjectTasks(
  uid: string,
  projectId: string,
): Promise<number> {
  const snap = await getDocs(
    query(tasksRef(uid), where("projectId", "==", projectId)),
  );
  return snap.size;
}

export async function deleteProject(
  uid: string,
  projectId: string,
  options: { deleteTasks: boolean },
): Promise<void> {
  const db = getFirebaseFirestore();
  const tasks = await getDocs(
    query(tasksRef(uid), where("projectId", "==", projectId)),
  );

  // Tasks first, in chunks; the project itself goes in the last batch, so
  // a failure part-way never leaves tasks pointing at a deleted project.
  const docs = tasks.docs;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const task of docs.slice(i, i + BATCH_LIMIT)) {
      if (options.deleteTasks) batch.delete(task.ref);
      else
        batch.update(task.ref, {
          projectId: null,
          areaId: null,
          bucketId: null,
        });
    }
    await batch.commit();
  }
  const last = writeBatch(db);
  last.delete(projectRef(uid, projectId));
  await last.commit();
}

// ---- Made from a picker (New task's Project, New project's Area and
// Section): just a name, the rest as the full forms default it. Their
// own pages fill in the rest later.

async function quickCreateProjectWrite(
  uid: string,
  name: string,
  color: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const today = new Date();
  await setDoc(projectRef(uid, id), {
    name: name.trim(),
    emoji: null,
    areaId: null,
    bucketId: null,
    color,
    priority: DEFAULT_PRIORITY,
    startDate: Timestamp.fromDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    ),
    endDate: null,
    originalEndDate: null,
    rescheduleCount: 0,
    description: "",
    status: "Active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

async function quickCreateAreaWrite(
  uid: string,
  name: string,
  color: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(areaRef(uid, id), {
    name: name.trim(),
    emoji: null,
    color,
    description: "",
    weeklyHoursTarget: null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

async function quickCreateSectionWrite(
  uid: string,
  areaId: string,
  name: string,
  color: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(sectionRef(uid, id), {
    name: name.trim(),
    emoji: null,
    color,
    description: "",
    areaId,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

// Guarded against double submits (writeGuard.ts).
export const quickCreateArea = guardWrite(
  "quickCreateArea",
  quickCreateAreaWrite,
);
export const quickCreateProject = guardWrite(
  "quickCreateProject",
  quickCreateProjectWrite,
);
export const quickCreateSection = guardWrite(
  "quickCreateSection",
  quickCreateSectionWrite,
);

// ---- Deleting a folder or an area for good (from the Archive). The person
// chooses what happens to what's inside (owner, 24 Nov 2026):
//   kept (the default): a folder's projects and tasks move to its area's
//     default folder; an area's folders go, and its projects and tasks
//     become unfiled (no area, no folder);
//   deleted with it: every project in it and every task in it or in those
//     projects (subtasks carry the same projectId), then the place itself.

export interface DeleteContents {
  deleteContents: boolean;
}

async function deleteAll(refs: DocumentReference[]) {
  const db = getFirebaseFirestore();
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

/** Every task of these projects, beside the ones already found, once each. */
async function withProjectTasks(
  uid: string,
  projectIds: string[],
  found: { ref: DocumentReference; id: string }[],
): Promise<DocumentReference[]> {
  const byId = new Map(found.map((d) => [d.id, d.ref]));
  for (const projectId of projectIds) {
    const snap = await getDocs(
      query(tasksRef(uid), where("projectId", "==", projectId)),
    );
    for (const d of snap.docs) byId.set(d.id, d.ref);
  }
  return [...byId.values()];
}

async function updateAll(
  refs: { ref: DocumentReference }[],
  patch: Record<string, unknown>,
) {
  const db = getFirebaseFirestore();
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of refs.slice(i, i + BATCH_LIMIT)) batch.update(d.ref, patch);
    await batch.commit();
  }
}

async function deleteSectionWrite(
  uid: string,
  sectionId: string,
  areaId: string,
  options: DeleteContents = { deleteContents: false },
): Promise<void> {
  const home = `default-${areaId}`;
  const [projects, tasks] = await Promise.all([
    getDocs(query(projectsRef(uid), where("bucketId", "==", sectionId))),
    getDocs(query(tasksRef(uid), where("bucketId", "==", sectionId))),
  ]);
  if (options.deleteContents) {
    // Tasks first, then projects, then the folder: a failure part-way never
    // leaves a task pointing at a project that's gone.
    await deleteAll(
      await withProjectTasks(
        uid,
        projects.docs.map((d) => d.id),
        tasks.docs,
      ),
    );
    await deleteAll(projects.docs.map((d) => d.ref));
    await deleteAll([sectionRef(uid, sectionId)]);
    return;
  }
  await updateAll(projects.docs, {
    bucketId: home,
    updatedAt: serverTimestamp(),
  });
  await updateAll(tasks.docs, { bucketId: home });
  const last = writeBatch(getFirebaseFirestore());
  last.delete(sectionRef(uid, sectionId));
  await last.commit();
}

async function deleteAreaWrite(
  uid: string,
  areaId: string,
  options: DeleteContents = { deleteContents: false },
): Promise<void> {
  const [sections, projects, tasks] = await Promise.all([
    getDocs(query(sectionsRef(uid), where("areaId", "==", areaId))),
    getDocs(query(projectsRef(uid), where("areaId", "==", areaId))),
    getDocs(query(tasksRef(uid), where("areaId", "==", areaId))),
  ]);
  if (options.deleteContents) {
    await deleteAll(
      await withProjectTasks(
        uid,
        projects.docs.map((d) => d.id),
        tasks.docs,
      ),
    );
    await deleteAll(projects.docs.map((d) => d.ref));
  } else {
    await updateAll(projects.docs, {
      areaId: null,
      bucketId: null,
      updatedAt: serverTimestamp(),
    });
    await updateAll(tasks.docs, { areaId: null, bucketId: null });
  }
  const db = getFirebaseFirestore();
  for (let i = 0; i < sections.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const s of sections.docs.slice(i, i + BATCH_LIMIT))
      batch.delete(s.ref);
    await batch.commit();
  }
  const last = writeBatch(db);
  last.delete(areaRef(uid, areaId));
  await last.commit();
}

export const deleteSectionForGood = guardWrite(
  "deleteSectionForGood",
  deleteSectionWrite,
);
export const deleteAreaForGood = guardWrite(
  "deleteAreaForGood",
  deleteAreaWrite,
);
