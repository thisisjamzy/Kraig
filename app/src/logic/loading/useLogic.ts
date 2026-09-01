'use client';

// A PIN unlock (verify, or the NO_PIN fallback for a pre-PIN-era account)
// routes through here before /home ever renders — reuses home/useLogic's
// own data hooks so "ready" here means exactly what /home itself needs to
// render without its own loading flash, and so Firestore's local cache is
// already warm for those same queries by the time /home mounts a moment
// later (see src/shared/config/firebaseClient.ts's persistentLocalCache).
// Always lands on /home, never /onboarding — the only route to onboarding
// is a brand new account's "create your PIN" success, which skips this
// screen entirely (see src/logic/pin/useLogic.ts's unlockAndGoHome). An
// existing account never gets bounced into onboarding again just because it
// happens to have zero wallets right now.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLogic as useHomeLogic } from '@/src/logic/home/useLogic';

export function useLogic() {
  const router = useRouter();
  const { loading, error } = useHomeLogic();

  useEffect(() => {
    if (loading || error) return;
    router.replace('/home');
  }, [loading, error, router]);

  return { error };
}
