'use client';

// Browser-side Firebase (PRD-FIREBASE.md). Every screen reads and writes
// Firestore directly through the client SDK from here, governed by
// Security Rules (firestore.rules) — there is no more server standing
// between the app and its data (PRD-FIREBASE.md section 2). Auth
// (PRD-AUTH-FIREBASE.md section 5) and the two PIN Callable Functions
// (functions/src/pin.ts) are the only other Firebase surfaces the client
// touches.

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { env } from '@/src/shared/config/env';

// Deliberately not validated with env.ts's required() here — this module
// loads on every page that imports it, including before a Firebase project
// has been created, and a top-level throw would take down pages that never
// touch auth. Firebase's own SDK surfaces a clear error the moment an empty
// config actually gets used (e.g. signInWithEmailAndPassword), instead.
const firebaseConfig = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  appId: env.firebase.appId,
};

// Lazy singletons, not eager top-level `export const`s: 'use client'
// modules still execute their top-level code once during SSR/static
// prerendering (a Node environment, not the browser) — getAuth() validates
// the config synchronously and throws on an empty/placeholder API key,
// which would otherwise fail every build before a real Firebase project
// even exists. Deferring construction to first *call* means it only ever
// runs from actual browser-only code (event handlers, effects).
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let functionsClient: Functions | null = null;
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;
let functionsEmulatorConnected = false;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  // Opt-in only, see env.ts's comment on firebase.useEmulator for why this
  // isn't a blanket `NODE_ENV !== 'production'` check as
  // PRD-AUTH-FIREBASE.md section 9 suggests.
  if (env.firebase.useEmulator && !authEmulatorConnected) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    authEmulatorConnected = true;
  }
  return auth;
}

/**
 * initializeFirestore with persistentLocalCache (not the plain getFirestore)
 * — PRD-FIREBASE.md section 15: this is what gives the PWA its offline
 * read/write-queue story for free, no custom service-worker caching logic
 * for ledger data. persistentMultipleTabManager lets more than one open tab
 * (or an installed-PWA window plus a browser tab) share the same cache
 * instead of one of them falling back to memory-only.
 */
export function getFirebaseFirestore(): Firestore {
  if (firestore) return firestore;
  firestore = initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (env.firebase.useEmulator && !firestoreEmulatorConnected) {
    connectFirestoreEmulator(firestore, 'localhost', 8080);
    firestoreEmulatorConnected = true;
  }
  return firestore;
}

export function getFirebaseFunctions(): Functions {
  if (functionsClient) return functionsClient;
  functionsClient = getFunctions(getFirebaseApp());
  if (env.firebase.useEmulator && !functionsEmulatorConnected) {
    connectFunctionsEmulator(functionsClient, 'localhost', 5001);
    functionsEmulatorConnected = true;
  }
  return functionsClient;
}
