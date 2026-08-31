/**
 * Removes every document written by scripts/seed-dummy-data.ts — anything
 * with an id starting "dummy_" in a specific account's accounts,
 * categories, budgetRules, transactions, or transfers — then recomputes
 * every materialized stats collection so balances/stats reflect whatever
 * real data is left in that account.
 *
 * Every ledger collection lives under users/{uid}/... now (see refs.ts's
 * and firestore.rules' headers), so this needs to know WHICH account to
 * unseed.
 *
 * Setup:
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   TARGET_UID=<firebase auth uid> (or TARGET_EMAIL=<the account's email>)
 *   npx tsx scripts/unseed-dummy-data.ts
 */

import { db, requireTargetUid } from './lib/adminApp';
import { recomputeEverything } from './lib/recomputeStats';

const bulkWriter = db.bulkWriter();
const COLLECTIONS = ['transactions', 'transfers', 'budgetRules', 'plannedPayments', 'categories', 'accounts'];
// '' (a private-use codepoint) sorts after every normal character —
// the standard Firestore prefix-range trick, matches every doc id starting
// with "dummy_". Written as an escape sequence rather than the literal
// character so it stays visible/editable in this source file.
const PREFIX_END = 'dummy_' + '';

async function main() {
  const uid = await requireTargetUid();
  const userDoc = db.collection('users').doc(uid);
  console.log(`Unseeding dummy data for uid ${uid}...`);

  let total = 0;
  for (const collection of COLLECTIONS) {
    const snap = await userDoc
      .collection(collection)
      .where('__name__', '>=', 'dummy_')
      .where('__name__', '<', PREFIX_END)
      .get();
    snap.docs.forEach((doc) => bulkWriter.delete(doc.ref));
    total += snap.size;
    console.log(`${collection}: deleting ${snap.size} dummy_* documents`);
  }
  await bulkWriter.flush();
  await recomputeEverything(bulkWriter, uid);
  await bulkWriter.close();
  console.log(`\nDone. Removed ${total} dummy_* documents and recomputed stats from what's left.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
