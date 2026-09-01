'use client';

// The screen PIN unlock (and a returning sign-in) routes through before
// /home ever renders — reuses home/useLogic's own data hooks so "ready" here
// means exactly what /home itself needs to render without its own loading
// flash, and so Firestore's local cache is already warm for those same
// queries by the time /home mounts a moment later (see
// src/shared/config/firebaseClient.ts's persistentLocalCache). A brand new
// account (no wallets yet) goes to /onboarding instead — see
// src/logic/onboarding/useLogic.ts.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLogic as useHomeLogic } from '@/src/logic/home/useLogic';

export function useLogic() {
  const router = useRouter();
  const { wallets, loading, error } = useHomeLogic();

  useEffect(() => {
    if (loading || error) return;
    router.replace(wallets.length === 0 ? '/onboarding' : '/home');
  }, [loading, error, wallets.length, router]);

  return { error };
}
