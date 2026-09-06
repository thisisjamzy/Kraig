'use client';

// Guards the authenticated app shell (Home, Budget, etc.) — proxy.ts's own
// gate only ever checks a plain cookie, never Firebase Auth's own session,
// so landing here at all just means that cookie said yes, not that a real
// session actually exists (it can drift out of sync with Firebase's own
// storage, e.g. after an iOS PWA relaunch evicts one storage area but not
// another). Confirm against the real thing before rendering anything that
// reads Firestore — rendering on a stale flag alone just produces a blank
// screen once every query silently returns nothing for a null-auth request
// (src/shared/firestore/queries.ts), never an error to explain why.

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { clearSignedIn } from '@/src/shared/config/authSession';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useFirebaseUser();

  useEffect(() => {
    if (loading || user) return;
    clearSignedIn();
    router.replace('/sign-in');
  }, [loading, user, router]);

  if (loading || !user) {
    return null;
  }

  return <>{children}</>;
}
