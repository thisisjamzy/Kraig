'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PIN_DISABLED_KEY, PIN_VERIFIED_KEY } from '@/src/shared/config/pinGate';

export function PinGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // Settings' "Require PIN" toggle (src/logic/settings/useLogic.ts) — once
    // disabled on this device, proxy.ts already let the request through on
    // this same basis; this client-side gate has to agree, or it would just
    // bounce straight back to /pin itself.
    if (
      window.sessionStorage.getItem(PIN_VERIFIED_KEY) === '1' ||
      window.localStorage.getItem(PIN_DISABLED_KEY) === '1'
    ) {
      setVerified(true);
    } else {
      router.replace('/pin');
    }
  }, [router]);

  if (!verified) {
    return null;
  }

  return <>{children}</>;
}
