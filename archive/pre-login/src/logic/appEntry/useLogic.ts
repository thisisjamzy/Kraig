'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { isStandalonePwa, SIGNED_IN_KEY } from '@/src/shared/config/appEntry';
import { clearSignedIn } from '@/src/shared/config/authSession';

export type AppEntryMode = 'checking' | 'marketing' | 'splash';

export function useLogic() {
  const router = useRouter();
  const [mode, setMode] = useState<AppEntryMode>('checking');

  useEffect(() => {
    if (!isStandalonePwa()) {
      // Opened as a regular web page (not installed): always the marketing site.
      setMode('marketing');
      return;
    }

    if (window.localStorage.getItem(SIGNED_IN_KEY) !== '1') {
      // Installed but never signed in before: the app's own splash screen,
      // which leads to sign-up/sign-in from a standing start.
      setMode('splash');
      return;
    }

    // Installed and signed in before: never trust that carried-over session
    // on a fresh home-screen launch — sign out of Firebase and clear the
    // local flag, then send the device through a real sign-in every time.
    // This is deliberate (not a bug to self-heal): the whole point is that
    // a home-screen launch always requires re-entering credentials, however
    // durable Firebase's own session storage is under the hood.
    (async () => {
      await signOut(getFirebaseAuth()).catch(() => {});
      clearSignedIn();
      router.replace('/sign-in');
    })();
  }, [router]);

  return { mode };
}
