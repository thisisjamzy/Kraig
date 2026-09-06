'use client';

// Firebase has no built-in provider/hook pair the way next-auth's
// SessionProvider/useSession did — this is the small equivalent. Two kinds
// of callers rely on it now: Settings' name/email (PRD-AUTH-FIREBASE.md
// section 6), and every Firestore query hook (src/shared/firestore/
// queries.ts) that needs the real uid to build its query. Route protection
// itself (proxy.ts) still only reads its own local cookie, never this — but
// AuthGuard (src/widgets/AuthGuard) does use this hook to confirm a real
// Firebase session actually backs that cookie before trusting it, see
// authSession.ts's header for why that check exists.

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';

export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // getFirebaseAuth() is only ever called from inside this effect, never
    // during render — effects don't run during SSR/prerender, only after
    // the component mounts in the browser (see firebaseClient.ts).
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
