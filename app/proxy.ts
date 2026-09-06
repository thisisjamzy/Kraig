// Route protection — PRD-FIREBASE.md section 1 (correcting
// PRD-AUTH-FIREBASE.md's original session-cookie design): with Firestore as
// the live datastore, every read and write is authenticated and authorized
// by Firestore itself via Security Rules (firestore.rules) on every single
// request — that's the real security boundary now, not anything this file
// does. This is purely a UX redirect based on a plain (non-httpOnly) cookie
// the client sets after a Firebase Auth state change
// (src/shared/config/clientCookies.ts, src/shared/config/authSession.ts) —
// the same "not a security boundary" framing PRD-AUTH-FIREBASE.md already
// used for its Edge cookie-presence check, now true for the whole app, not
// only that one check.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SIGNED_IN_KEY } from '@/src/shared/config/appEntry';

const AUTH_PATHS = new Set(['/sign-in', '/sign-up']);
const OPEN_PATHS = new Set(['/', '/~offline']);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(SIGNED_IN_KEY));

  if (OPEN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Sign-in/sign-up are airtight against an already-authenticated session:
  // once signed in, there is no path back to these forms — not the browser
  // back button, not a typed-in URL. Land wherever that session actually
  // belongs instead.
  if (AUTH_PATHS.has(pathname)) {
    if (!signedIn) return NextResponse.next();
    return NextResponse.redirect(new URL('/loading', request.url));
  }

  if (!signedIn) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
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
