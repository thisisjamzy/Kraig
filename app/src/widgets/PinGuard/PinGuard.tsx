'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PIN_VERIFIED_KEY } from '@/src/shared/config/pinGate';

export function PinGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(PIN_VERIFIED_KEY) === '1') {
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
