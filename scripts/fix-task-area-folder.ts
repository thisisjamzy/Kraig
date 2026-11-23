/**
 * Tasks whose areaId or bucketId (folder) is out of step with their
 * project's (brief 23 Nov 2026, package 7). FirestoreTask mirrors its
 * project's areaId and bucketId; older imports wrote null for both.
 *
 * Idempotent: it only ever sets a task's areaId and bucketId to its
 * project's, so running it twice changes nothing the second time. A task
 * with no project is left alone (the Inbox: both null). A task whose
 * project no longer exists is reported, never changed.
 *
 * Dry run by default: it counts and lists, and writes nothing.
 *   TARGET_EMAIL=<email> npx tsx scripts/fix-task-area-folder.ts
 * To write the fixes:
 *   TARGET_EMAIL=<email> npx tsx scripts/fix-task-area-folder.ts --apply
 */

import { db, requireTargetUid } from './lib/adminApp';

const APPLY = process.argv.includes('--apply');
const BATCH = 450;

async function main() {
  const uid = await requireTargetUid();
  const user = db.collection('users').doc(uid);
  const [projects, tasks] = await Promise.all([user.collection('projects').get(), user.collection('tasks').get()]);
  const projectById = new Map(projects.docs.map((d) => [d.id, d.data() as { areaId?: string | null; bucketId?: string | null; name?: string }]));

  const fixes: { id: string; title: string; areaId: string | null; bucketId: string | null }[] = [];
  let orphans = 0;
  for (const doc of tasks.docs) {
    const t = doc.data() as { projectId?: string | null; areaId?: string | null; bucketId?: string | null; title?: string };
    if (!t.projectId) continue;
    const p = projectById.get(t.projectId);
    if (!p) {
      orphans++;
      continue;
    }
    const areaId = p.areaId ?? null;
    const bucketId = p.bucketId ?? null;
    if ((t.areaId ?? null) !== areaId || (t.bucketId ?? null) !== bucketId) fixes.push({ id: doc.id, title: t.title ?? '', areaId, bucketId });
  }

  console.log(`${tasks.size} tasks, ${fixes.length} out of step with their project, ${orphans} pointing at a project that no longer exists.`);
  for (const f of fixes.slice(0, 20)) console.log(`  ${f.id}  ${f.title}`);
  if (fixes.length > 20) console.log(`  … and ${fixes.length - 20} more`);
  if (!APPLY) {
    console.log('Dry run: nothing written. Add --apply to fix them.');
    return;
  }
  for (let i = 0; i < fixes.length; i += BATCH) {
    const batch = db.batch();
    for (const f of fixes.slice(i, i + BATCH)) batch.update(user.collection('tasks').doc(f.id), { areaId: f.areaId, bucketId: f.bucketId });
    await batch.commit();
  }
  console.log(`Fixed ${fixes.length} tasks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
