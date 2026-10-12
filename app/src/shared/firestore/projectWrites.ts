'use client';

// Deleting a project for good (archiving is still the reversible option —
// status 'Archived'). Its milestones live on the project doc and go with
// it. Its tasks (subtasks included — they carry the same projectId) are
// either deleted too, or kept as standalone tasks: projectId, and the
// areaId/bucketId mirrored from the project, cleared.

import { getDocs, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import { areaRef, projectRef, sectionRef, tasksRef } from './refs';

// Firestore caps a batch at 500 writes.
const BATCH_LIMIT = 450;

export async function countProjectTasks(uid: string, projectId: string): Promise<number> {
  const snap = await getDocs(query(tasksRef(uid), where('projectId', '==', projectId)));
  return snap.size;
}

export async function deleteProject(uid: string, projectId: string, options: { deleteTasks: boolean }): Promise<void> {
  const db = getFirebaseFirestore();
  const tasks = await getDocs(query(tasksRef(uid), where('projectId', '==', projectId)));

  // Tasks first, in chunks; the project itself goes in the last batch, so
  // a failure part-way never leaves tasks pointing at a deleted project.
  const docs = tasks.docs;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const task of docs.slice(i, i + BATCH_LIMIT)) {
      if (options.deleteTasks) batch.delete(task.ref);
      else batch.update(task.ref, { projectId: null, areaId: null, bucketId: null });
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

export async function quickCreateProject(uid: string, name: string, color: string): Promise<string> {
  const id = crypto.randomUUID();
  const today = new Date();
  await setDoc(projectRef(uid, id), {
    name: name.trim(),
    emoji: null,
    areaId: null,
    bucketId: null,
    color,
    priority: DEFAULT_PRIORITY,
    startDate: Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth(), today.getDate())),
    endDate: null,
    originalEndDate: null,
    rescheduleCount: 0,
    description: '',
    status: 'Active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function quickCreateArea(uid: string, name: string, color: string): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(areaRef(uid, id), {
    name: name.trim(),
    emoji: null,
    color,
    description: '',
    weeklyHoursTarget: null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function quickCreateSection(uid: string, areaId: string, name: string, color: string): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(sectionRef(uid, id), {
    name: name.trim(),
    emoji: null,
    color,
    description: '',
    areaId,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}
