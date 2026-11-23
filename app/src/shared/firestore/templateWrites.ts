// Template writes (owner, 23 Nov 2026). None of them touch the ledger:
// recording from a template goes through Add transaction as usual.

import { Timestamp, serverTimestamp, updateDoc } from 'firebase/firestore';
import { transactionTemplateRef } from '@/src/shared/firestore/refs';

/** Recording from a template: it moves to the top of the picker and stops being due today. */
export async function markTemplateUsed(uid: string, id: string): Promise<void> {
  await updateDoc(transactionTemplateRef(uid, id), { lastUsedAt: Timestamp.now(), updatedAt: serverTimestamp() });
}

/** Skip a due template for the day: nothing is recorded. */
export async function skipTemplate(uid: string, id: string, day: string): Promise<void> {
  await updateDoc(transactionTemplateRef(uid, id), { lastSkippedOn: day, updatedAt: serverTimestamp() });
}

export async function setTemplateArchived(uid: string, id: string, archived: boolean): Promise<void> {
  await updateDoc(transactionTemplateRef(uid, id), { archived, updatedAt: serverTimestamp() });
}
