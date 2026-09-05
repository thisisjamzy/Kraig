'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PIN_DISABLED_KEY, PIN_VERIFIED_KEY } from '@/src/shared/config/pinGate';
import { clearAllLocalAuthFlags } from '@/src/shared/config/authSession';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export function PinGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  // A normal PIN_VERIFIED_KEY unlock already went through /pin, which
  // confirms a real Firebase session before it ever gets here (see
  // src/logic/pin/useLogic.ts). The PIN_DISABLED_KEY bypass below skips
  // /pin entirely though, so it's the one path into this shell that's never
  // actually checked Firebase's own auth state — only this device's local
  // flag. Wait for the real check before trusting that bypass.
  const { user, loading: authLoading } = useFirebaseUser();

  useEffect(() => {
    const pinVerified = window.sessionStorage.getItem(PIN_VERIFIED_KEY) === '1';
    const pinDisabled = window.localStorage.getItem(PIN_DISABLED_KEY) === '1';

    if (!pinVerified && !pinDisabled) {
      router.replace('/pin');
      return;
    }

    if (pinVerified) {
      // Already vouched for by a real Firebase session at /pin — no need to
      // wait on useFirebaseUser's own async rehydration here too.
      setVerified(true);
      return;
    }

    // pinDisabled path: this device's local flags say the account skips the
    // PIN gate, but that flag alone was never proof a real Firebase session
    // exists (see authSession.ts's clearAllLocalAuthFlags header) — render
    // this shell on a stale flag and every Firestore query underneath it
    // just comes back empty with no error to explain why
    // (src/shared/firestore/queries.ts). Confirm against the real thing
    // first.
    if (authLoading) return;
    if (!user) {
      clearAllLocalAuthFlags();
      router.replace('/sign-in');
      return;
    }
    setVerified(true);
  }, [router, authLoading, user]);

  if (!verified) {
    return null;
  }

  return <>{children}</>;
}
