'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isStandalonePwa, SIGNED_IN_KEY } from '@/src/shared/config/appEntry';
import { PIN_DISABLED_KEY } from '@/src/shared/config/pinGate';
import { setClientCookie, PERSISTENT_COOKIE_MAX_AGE_SECONDS } from '@/src/shared/config/clientCookies';

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
      // Re-affirm both cookies right here, before navigating anywhere —
      // same self-healing move src/logic/pin/useLogic.ts's unlockAndGoHome
      // already makes for this exact reason (see authSession.ts's header).
      // An installed, home-screen-launched PWA is the one context where
      // this localStorage flag and its cookie mirror have been observed to
      // drift apart after the OS fully terminates and relaunches the app
      // (localStorage survives, the cookie doesn't) — proxy.ts's middleware
      // only ever reads the cookie, so a stale/missing one here bounced the
      // very next request to /sign-in, which the client didn't expect and
      // kept retrying, reading as the splash screen endlessly flashing back
      // in. Rewriting it fresh from the localStorage flag we just trusted
      // means the redirect below is always backed by a cookie that's
      // actually there for proxy.ts to see.
      setClientCookie(SIGNED_IN_KEY, '1', PERSISTENT_COOKIE_MAX_AGE_SECONDS);
      const pinDisabled = window.localStorage.getItem(PIN_DISABLED_KEY) === '1';
      if (pinDisabled) setClientCookie(PIN_DISABLED_KEY, '1', PERSISTENT_COOKIE_MAX_AGE_SECONDS);
      // Installed and previously signed in: PIN gate on every launch,
      // unless Settings' "Require PIN" toggle turned that off on this
      // device (src/logic/settings/useLogic.ts) — then straight to
      // /loading, same as a successful PIN unlock would.
      router.replace(pinDisabled ? '/loading' : '/pin');
    } else {
      // Installed but never signed in: the app's own splash/onboarding screen.
      setMode('splash');
    }
  }, [router]);

  return { mode };
}
