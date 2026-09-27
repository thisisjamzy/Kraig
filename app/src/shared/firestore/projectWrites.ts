'use client';

// Deleting a project for good (archiving is still the reversible option —
// status 'Archived'). Its milestones live on the project doc and go with
// it. Its tasks (subtasks included — they carry the same projectId) are
// either deleted too, or kept as standalone tasks: projectId, and the
// areaId/bucketId mirrored from the project, cleared.

import { getDocs, query, where, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';
import { projectRef, tasksRef } from './refs';

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
