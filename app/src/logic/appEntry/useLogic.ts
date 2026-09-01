'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isStandalonePwa, SIGNED_IN_KEY } from '@/src/shared/config/appEntry';

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

    if (window.localStorage.getItem(SIGNED_IN_KEY) === '1') {
      // Installed and previously signed in: PIN gate on every launch.
      router.replace('/pin');
    } else {
      // Installed but never signed in: the app's own splash/onboarding screen.
      setMode('splash');
    }
  }, [router]);

  return { mode };
}
