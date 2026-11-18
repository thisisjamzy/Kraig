'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { isStandalonePwa } from '@/src/shared/config/appEntry';
import { clearSignedIn } from '@/src/shared/config/authSession';

// The app's front door is sign-in (16 Nov 2026: the marketing site and the
// splash screen are archived in /archive/pre-login). proxy.ts already sends
// a signed-out visitor from / to /sign-in; this only runs for one who looks
// signed in:
//   - a home-screen launch of the installed app never trusts a carried-over
//     session: sign out and sign in again, every time (deliberate);
//   - anywhere else, on to /loading, which picks the home.
export function useLogic() {
  const router = useRouter();

  useEffect(() => {
    if (!isStandalonePwa()) {
      router.replace('/loading');
      return;
    }
    (async () => {
      await signOut(getFirebaseAuth()).catch(() => {});
      clearSignedIn();
      router.replace('/sign-in');
    })();
  }, [router]);
}
