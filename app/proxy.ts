// Route protection — PRD-FIREBASE.md section 1 (correcting
// PRD-AUTH-FIREBASE.md's original session-cookie design): with Firestore as
// the live datastore, every read and write is authenticated and authorized
// by Firestore itself via Security Rules (firestore.rules) on every single
// request — that's the real security boundary now, not anything this file
// does. This is purely a UX redirect based on plain (non-httpOnly) cookies
// the client sets after a Firebase Auth state change or a successful PIN
// Callable Function call (src/shared/config/clientCookies.ts,
// src/shared/config/authSession.ts) — the same "not a security boundary"
// framing PRD-AUTH-FIREBASE.md already used for its Edge cookie-presence
// check, now true for the whole app, not only that one check.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SIGNED_IN_KEY } from '@/src/shared/config/appEntry';
import { PIN_VERIFIED_KEY, PIN_DISABLED_KEY } from '@/src/shared/config/pinGate';

const AUTH_PATHS = new Set(['/sign-in', '/sign-up']);
const OPEN_PATHS = new Set(['/', '/~offline']);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(SIGNED_IN_KEY));
  const pinCleared = Boolean(request.cookies.get(PIN_VERIFIED_KEY)) || Boolean(request.cookies.get(PIN_DISABLED_KEY));

  if (OPEN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Sign-in/sign-up are airtight against an already-authenticated session:
  // once signed in, there is no path back to these forms — not the PIN
  // screen's own back button (removed), not the browser back button, not a
  // typed-in URL. Land wherever that session actually is instead (still
  // needs the PIN, or already past it).
  if (AUTH_PATHS.has(pathname)) {
    if (!signedIn) return NextResponse.next();
    return NextResponse.redirect(new URL(pinCleared ? '/loading' : '/pin', request.url));
  }

  if (!signedIn) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // /pin itself: only reachable signed-in, and only while genuinely still
  // gated — once cleared (verified this session, or the household turned
  // the PIN off), landing here again just bounces forward instead of
  // re-prompting.
  if (pathname === '/pin') {
    if (pinCleared) return NextResponse.redirect(new URL('/loading', request.url));
    return NextResponse.next();
  }

  // Settings' "Require PIN" toggle (src/logic/settings/useLogic.ts) — once
  // disabled on this device, skip the PIN gate entirely rather than
  // requiring PIN_VERIFIED_KEY too.
  if (!pinCleared) {
    return NextResponse.redirect(new URL('/pin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals, and anything that looks
    // like a static file (has a dot: .png, .ico, .webmanifest, .js, ...).
    '/((?!api|_next/static|_next/image|.*\\..*).*)',
  ],
};
