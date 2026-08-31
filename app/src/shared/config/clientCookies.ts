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

export function setClientCookie(name: string, value: string, maxAgeSeconds?: number): void {
  const maxAge = maxAgeSeconds != null ? `; max-age=${maxAgeSeconds}` : '';
  document.cookie = `${name}=${value}; path=/${maxAge}; samesite=lax`;
}

export function clearClientCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}
