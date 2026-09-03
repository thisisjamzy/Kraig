'use client';

// Plain (non-httpOnly) cookies, set directly by client code after a
// Firebase Auth state change or a successful PIN Callable Function call.
// PRD-FIREBASE.md section 1: there is no more Next.js session route to set
// an httpOnly cookie from, so proxy.ts's UX-redirect check now reads
// whatever the client itself last wrote here. This was never the real
// security boundary even before this change (Security Rules are, see
// firestore.rules) — it's strictly a cheap "should I bother redirecting"
// signal, so a client-writable cookie is exactly as trustworthy for that
// purpose as the httpOnly one was.

// For any cookie meant to survive an app/PWA restart (SIGNED_IN_KEY,
// PIN_DISABLED_KEY) rather than end with the browser session
// (PIN_VERIFIED_KEY, deliberately left session-scoped) — 400 days is the
// longest max-age a browser will actually honor (Chrome caps it there).
// Omitting maxAgeSeconds entirely makes a session cookie instead, which
// silently stops matching a same-named localStorage flag the moment an
// installed PWA's process fully restarts — see authSession.ts's header for
// the real bug that shape once caused.
export const PERSISTENT_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function setClientCookie(name: string, value: string, maxAgeSeconds?: number): void {
  const maxAge = maxAgeSeconds != null ? `; max-age=${maxAgeSeconds}` : '';
  document.cookie = `${name}=${value}; path=/${maxAge}; samesite=lax`;
}

export function clearClientCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}
