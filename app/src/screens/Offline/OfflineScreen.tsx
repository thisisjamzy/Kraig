'use client';

import { WifiOff } from 'lucide-react';
import { useStrings } from '@/src/strings/useStrings';
import styles from './OfflineScreen.module.css';

// Served by next-pwa as the precached fallback for any full-page navigation
// that fails with no cache and no network (see next.config.ts's
// fallbacks.document). Ledger data never lands here — Firestore's own
// persistentLocalCache serves it straight from the on-device cache, never a
// full redirect.
export function OfflineScreen() {
  const strings = useStrings();

  return (
    <div className={styles.page}>
      <div className={styles.iconCircle}>
        <WifiOff size={28} strokeWidth={1.75} />
      </div>
      <h1 className={styles.title}>{strings.offline.title}</h1>
      <p className={styles.tagline}>{strings.offline.tagline}</p>
      <button type="button" className={styles.retryButton} onClick={() => window.location.reload()}>
        {strings.offline.retry}
      </button>
    </div>
  );
}
