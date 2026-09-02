/**
 * Removes every document written by scripts/seed-goals-debt-dummy-data.ts —
 * anything with an id starting "dummy_gd_" in a specific account's
 * accounts, categories, or transactions, plus every goals/{goalId} and
 * debts/{debtId} doc with that prefix (and their lineItems/repayments
 * subcollections, which aren't separately prefix-filterable since they're
 * scoped under a parent that's already known-dummy) — then recomputes
 * account balances/stats from whatever real data is left.
 *
 * Setup:
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   TARGET_UID=<firebase auth uid> (or TARGET_EMAIL=<the account's email>)
 *   npx tsx scripts/unseed-goals-debt-dummy-data.ts
 */

import { db, requireTargetUid } from './lib/adminApp';
import { recomputeEverything } from './lib/recomputeStats';

const bulkWriter = db.bulkWriter();
const FLAT_COLLECTIONS = ['transactions', 'categories', 'accounts'];
// U+F8FF (a private-use codepoint) sorts after every normal character —
// the standard Firestore prefix-range trick, matches every doc id starting
// with "dummy_gd_".
const PREFIX = 'dummy_gd_';
const PREFIX_END = PREFIX + '';

async function main() {
  const uid = await requireTargetUid();
  const userDoc = db.collection('users').doc(uid);
  console.log(`Unseeding dummy Goals & Debt data for uid ${uid}...`);

  let total = 0;
  for (const collection of FLAT_COLLECTIONS) {
    const snap = await userDoc.collection(collection).where('__name__', '>=', PREFIX).where('__name__', '<', PREFIX_END).get();
    snap.docs.forEach((doc) => bulkWriter.delete(doc.ref));
    total += snap.size;
    console.log(`${collection}: deleting ${snap.size} dummy_gd_* documents`);
  }

  const goalsSnap = await userDoc.collection('goals').where('__name__', '>=', PREFIX).where('__name__', '<', PREFIX_END).get();
  for (const goalDoc of goalsSnap.docs) {
    const lineItemsSnap = await goalDoc.ref.collection('lineItems').get();
    lineItemsSnap.docs.forEach((doc) => bulkWriter.delete(doc.ref));
    total += lineItemsSnap.size;
    bulkWriter.delete(goalDoc.ref);
    total += 1;
  }
  console.log(`goals: deleting ${goalsSnap.size} dummy_gd_* documents (and their line items)`);

  const debtsSnap = await userDoc.collection('debts').where('__name__', '>=', PREFIX).where('__name__', '<', PREFIX_END).get();
  for (const debtDoc of debtsSnap.docs) {
    const repaymentsSnap = await debtDoc.ref.collection('repayments').get();
    repaymentsSnap.docs.forEach((doc) => bulkWriter.delete(doc.ref));
    total += repaymentsSnap.size;
    bulkWriter.delete(debtDoc.ref);
    total += 1;
  }
  console.log(`debts: deleting ${debtsSnap.size} dummy_gd_* documents (and their repayments)`);

  await bulkWriter.flush();
  await recomputeEverything(bulkWriter, uid);
  await bulkWriter.close();
  console.log(`\nDone. Removed ${total} dummy_gd_* documents and recomputed stats from what's left.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
