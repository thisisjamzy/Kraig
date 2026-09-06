'use client';

// Set once a sign-in/sign-up completes. PRD-FIREBASE.md section 1: there is
// no more Next.js session route — a successful Firebase sign-in (password or
// OAuth) is the whole story, no ID token ever gets handed to this server.
// This just marks "signed in" for proxy.ts's UX-redirect check, mirrored
// into both localStorage (read by src/logic/appEntry/useLogic.ts on
// relaunch) and a plain cookie (since middleware can't read localStorage).
//
// It does NOT mean "skip signing in again" — src/logic/appEntry/useLogic.ts
// forces a real sign-out and a fresh /sign-in on every standalone-PWA
// relaunch regardless of this flag, by design (the app never trusts a
// carried-over session on a fresh home-screen launch). This flag only
// covers the UX-redirect gate *during* an already-active session, so
// in-app navigation between protected routes doesn't need to re-check
// Firebase Auth on every request.

import { SIGNED_IN_KEY } from '@/src/shared/config/appEntry';
import { setClientCookie, clearClientCookie, PERSISTENT_COOKIE_MAX_AGE_SECONDS } from '@/src/shared/config/clientCookies';

export function markSignedIn(): void {
  window.localStorage.setItem(SIGNED_IN_KEY, '1');
  setClientCookie(SIGNED_IN_KEY, '1', PERSISTENT_COOKIE_MAX_AGE_SECONDS);
}

export function clearSignedIn(): void {
  window.localStorage.removeItem(SIGNED_IN_KEY);
  clearClientCookie(SIGNED_IN_KEY);
}
