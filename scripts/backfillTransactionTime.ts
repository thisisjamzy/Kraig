/**
 * Sets `occurredAt` and `timeSource: 'recorded'` on transactions and
 * transfers that have none (brief 23 Nov 2026, a time on every
 * transaction). Nothing has to run: the app already reads every older
 * entry's time through transactionInstant. This only makes it stored.
 *
 * The time is the one transactionInstant gives: the clock time the entry
 * was logged (loggedAt, or a createdAt that isn't just a copy of its date),
 * on its own date, in the household's time zone; 12:00 when there's
 * nothing to go on. The date never moves.
 *
 * Idempotent: an entry that already has occurredAt is never touched.
 * Batches of 450. Dry run by default (counts and five samples):
 *   TARGET_EMAIL=<email> npx tsx scripts/backfillTransactionTime.ts
 * To write:
 *   TARGET_EMAIL=<email> npx tsx scripts/backfillTransactionTime.ts --apply
 */

import { db, requireTargetUid, Timestamp } from './lib/adminApp';
import { clockIn, DEFAULT_TIME_ZONE, hhmm, recordedAt, transactionInstant } from '../app/src/viewmodels/transactionTime';

const APPLY = process.argv.includes('--apply');
const BATCH = 450;

async function main() {
  const uid = await requireTargetUid();
  const user = db.collection('users').doc(uid);
  const settings = (await user.collection('settings').doc('app').get()).data() as { timezone?: string } | undefined;
  const timeZone = settings?.timezone || DEFAULT_TIME_ZONE;

  const todo: { ref: FirebaseFirestore.DocumentReference; id: string; kind: string; date: Date; createdAt: Date | null; at: Date }[] = [];
  let noCreatedAt = 0;
  let noRecordedTime = 0;
  let already = 0;
  for (const kind of ['transactions', 'transfers'] as const) {
    const snap = await user.collection(kind).get();
    for (const doc of snap.docs) {
      const d = doc.data() as { date?: FirebaseFirestore.Timestamp; createdAt?: FirebaseFirestore.Timestamp; loggedAt?: FirebaseFirestore.Timestamp; occurredAt?: FirebaseFirestore.Timestamp };
      if (!d.date) continue;
      if (!d.createdAt) noCreatedAt++;
      if (d.occurredAt) {
        already++;
        continue;
      }
      if (!recordedAt(d)) noRecordedTime++;
      todo.push({ ref: doc.ref, id: doc.id, kind, date: d.date.toDate(), createdAt: d.createdAt?.toDate() ?? null, at: transactionInstant(d, timeZone) });
    }
  }

  console.log(`Time zone ${timeZone}. ${todo.length} entries without occurredAt (${already} already have one).`);
  console.log(`${noCreatedAt} have no createdAt; ${noRecordedTime} of those to fill have no recorded time at all and get 12:00.`);
  for (const t of todo.slice(0, 5)) {
    console.log(`  ${t.kind.slice(0, -1)} ${t.id}  date ${t.date.toISOString()}  createdAt ${t.createdAt?.toISOString() ?? 'none'}  ->  ${hhmm(clockIn(t.at, timeZone))}`);
  }
  if (!APPLY) {
    console.log('Dry run: nothing written. Add --apply to store them.');
    return;
  }
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = db.batch();
    for (const t of todo.slice(i, i + BATCH)) batch.update(t.ref, { occurredAt: Timestamp.fromDate(t.at), timeSource: 'recorded' });
    await batch.commit();
  }
  console.log(`Stored a time on ${todo.length} entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
