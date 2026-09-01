'use client';

// Firebase has no built-in provider/hook pair the way next-auth's
// SessionProvider/useSession did — this is the small equivalent, just for
// the one thing a client component still needs the Firebase SDK's own
// current-user object for (Settings' name/email, PRD-AUTH-FIREBASE.md
// section 6). Route protection never uses this — that's cookie-based
// (proxy.ts, getSessionUid), unrelated to the client SDK's own auth state.

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
