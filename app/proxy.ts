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
import { PIN_VERIFIED_KEY } from '@/src/shared/config/pinGate';

const PUBLIC_PATHS = new Set(['/', '/sign-in', '/sign-up', '/pin', '/~offline']);

export default function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SIGNED_IN_KEY)) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  if (!request.cookies.get(PIN_VERIFIED_KEY)) {
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
