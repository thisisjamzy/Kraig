'use client';

// Applies the preferences that set how the app starts, once per session:
// "Hide amounts by default" (Settings > Preferences). Renders nothing.

import { useEffect } from 'react';
import { usePreferences } from '@/src/shared/firestore/preferences';
import { setAmountsHidden } from '@/src/shared/hooks/usePrivacy';

const SESSION_KEY = 'dreda.prefsApplied';

export function PreferencesApplier() {
  const { prefs, loading, uid } = usePreferences();
  useEffect(() => {
    if (loading || !uid) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === uid) return;
      sessionStorage.setItem(SESSION_KEY, uid);
    } catch {
      // Applied again next time: harmless.
    }
    setAmountsHidden(prefs.hideAmounts);
  }, [loading, uid, prefs.hideAmounts]);
  return null;
}
