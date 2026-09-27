// Performs the writes recurringPlan.ts plans for a recurring task's save
// or delete.

import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { archiveTask, createTask, replaceOccurrence, updateTask } from '@/src/shared/firestore/taskWrites';
import { taskRef } from '@/src/shared/firestore/refs';
import type { SeriesWrite } from './recurringPlan';

export async function runWrites(uid: string, writes: SeriesWrite[]): Promise<void> {
  for (const write of writes) {
    switch (write.kind) {
      case 'exception':
        await replaceOccurrence(uid, write.seriesId, write.key, write.exception);
        break;
      case 'update':
        await updateTask(uid, write.taskId, write.input);
        break;
      case 'endSeries':
        await updateDoc(taskRef(uid, write.taskId), {
          rrule: write.rrule,
          exceptions: write.exceptions,
          updatedAt: serverTimestamp(),
        });
        break;
      case 'create': {
        const { done, rrule, ...rest } = write.form;
        const id = await createTask(uid, {
          ...rest,
          timeMode: rest.timeMode,
          createdBy: uid,
          rrule,
          exceptions: write.exceptions,
        });
        // A one-off task split off already done keeps that.
        if (done && !rrule) await updateDoc(taskRef(uid, id), { done: true, status: 'Done', completedAt: serverTimestamp() });
        break;
      }
      case 'archive':
        await archiveTask(uid, write.taskId);
        break;
    }
  }
}
