import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Cloud Functions runtime provides application-default credentials
// automatically — no cert()/service-account plumbing needed here the way
// the Next.js app's admin SDK usage did (that's gone now anyway, see
// PRD-FIREBASE.md section 1).
export const adminApp = getApps().length ? getApps()[0] : initializeApp();
export const db = getFirestore(adminApp);
