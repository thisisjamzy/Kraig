// Shared Admin SDK init for the one-off scripts in scripts/ that write
// directly to a real Firebase project (seed-dummy-data.ts,
// unseed-dummy-data.ts, migrate-notion-to-firestore.ts).
//
// firebase-admin v13 dropped the old `admin.firestore()`/`admin.credential.cert()`
// namespace API entirely (confirmed via `require('firebase-admin')` — no
// `.apps`/`.firestore`/`.credential` on it at all) in favor of the modular
// imports below, same pattern functions/src/lib/firestore.ts already uses
// (that one relies on Application Default Credentials instead of cert(),
// since it runs inside the Cloud Functions runtime; these scripts run
// outside it and need an explicit service account).

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp as FirestoreTimestamp, type DocumentData } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Loads app/.env.local's FIREBASE_ADMIN_* vars into process.env if they
// aren't already set (e.g. by the shell), so `npx tsx scripts/seed-dummy-data.ts`
// works standalone without hand-exporting anything first. Never overwrites
// an already-set var. Minimal by design (this repo has no dotenv
// dependency) — good enough for the simple single-line KEY=VALUE format
// app/.env.local actually uses.
function loadDotEnvLocal() {
  const path = join(__dirname, '..', '..', 'app', '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }),
    });

export const db = getFirestore(app);
export const Timestamp = FirestoreTimestamp;
export type { DocumentData };

/**
 * Every ledger collection lives under users/{uid}/... now (see refs.ts's
 * and firestore.rules' headers — no more shared top-level collections),
 * so every script that writes ledger data needs to know WHICH account it's
 * writing for. Reads TARGET_UID directly if set, otherwise looks it up from
 * TARGET_EMAIL via the Auth Admin API (more convenient than hunting for a
 * uid in the Firebase Console — the account has to already exist, this
 * never creates one).
 */
export async function requireTargetUid(): Promise<string> {
  if (process.env.TARGET_UID) return process.env.TARGET_UID;
  if (process.env.TARGET_EMAIL) {
    const user = await getAuth(app).getUserByEmail(process.env.TARGET_EMAIL);
    return user.uid;
  }
  throw new Error(
    'Set TARGET_UID=<firebase auth uid> or TARGET_EMAIL=<the account\'s email> — every ledger collection is per-account now, this script needs to know which account to write for.'
  );
}
