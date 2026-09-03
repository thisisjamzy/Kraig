'use client';

// PRD-FIREBASE.md section 1: there is no more Next.js session route — a
// successful Firebase sign-in (password or OAuth) is the whole story, no ID
// token ever gets handed to this server. This just marks "signed in" for
// proxy.ts's UX-redirect check (SIGNED_IN_KEY, mirrored into both
// localStorage — read by src/logic/appEntry/useLogic.ts on relaunch — and a
// plain cookie, since middleware can't read localStorage) and, for a brand
// new account, hints the PIN screen to open straight into "create" mode.

import { SIGNED_IN_KEY } from '@/src/shared/config/appEntry';
import { PIN_CREATE_HINT_KEY } from '@/src/shared/config/pinGate';
import { setClientCookie, clearClientCookie, PERSISTENT_COOKIE_MAX_AGE_SECONDS } from '@/src/shared/config/clientCookies';

// Missing a maxAge here once made this a *session* cookie, cleared the
// moment an installed PWA's process fully restarted — while SIGNED_IN_KEY's
// localStorage mirror (durable) and Firebase Auth's own session (also
// durable) both survived. appEntry/useLogic.ts's localStorage check would
// still route a relaunch straight to /pin, the user would enter a correct
// PIN, and only THEN would proxy.ts's middleware — which only ever reads
// this cookie, never localStorage — see no SIGNED_IN_KEY and bounce to
// /sign-in anyway. See src/logic/pin/useLogic.ts's unlockAndGoHome, which
// now also re-affirms this cookie at the one moment it has the strongest
// possible proof the user is actually signed in (a Firestore-backed PIN
// Callable Function just accepted their auth token).
export function markSignedIn(options: { isNewAccount?: boolean } = {}): void {
  window.localStorage.setItem(SIGNED_IN_KEY, '1');
  setClientCookie(SIGNED_IN_KEY, '1', PERSISTENT_COOKIE_MAX_AGE_SECONDS);
  if (options.isNewAccount) {
    window.sessionStorage.setItem(PIN_CREATE_HINT_KEY, '1');
  }
}

export function clearSignedIn(): void {
  window.localStorage.removeItem(SIGNED_IN_KEY);
  clearClientCookie(SIGNED_IN_KEY);
}
