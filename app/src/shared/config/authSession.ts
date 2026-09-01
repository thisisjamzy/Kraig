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
import { setClientCookie, clearClientCookie } from '@/src/shared/config/clientCookies';

export function markSignedIn(options: { isNewAccount?: boolean } = {}): void {
  window.localStorage.setItem(SIGNED_IN_KEY, '1');
  setClientCookie(SIGNED_IN_KEY, '1');
  if (options.isNewAccount) {
    window.sessionStorage.setItem(PIN_CREATE_HINT_KEY, '1');
  }
}

export function clearSignedIn(): void {
  window.localStorage.removeItem(SIGNED_IN_KEY);
  clearClientCookie(SIGNED_IN_KEY);
}
