'use client';

// "Synced 1 min ago": when the app last had everything it's listening to
// in step with the server (Firestore's onSnapshotsInSync), or "Offline".

import { useEffect, useState } from 'react';
import { onSnapshotsInSync } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/shared/config/firebaseClient';

export function syncLabel(lastSync: number | null, online: boolean, now: number): string {
  if (!online) return 'Offline';
  if (!lastSync) return 'Syncing';
  const minutes = Math.floor((now - lastSync) / 60000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Synced ${hours} h ago`;
}

export function useSyncStatus(): string {
  const { lastSync, online, now } = useSyncState();
  return syncLabel(lastSync, online, now);
}

/** When the app was last in step with the server, and whether it's online now. */
export function useSyncState(): { lastSync: number | null; online: boolean; now: number } {
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stop = onSnapshotsInSync(getFirebaseFirestore(), () => setLastSync(Date.now()));
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      stop();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.clearInterval(tick);
    };
  }, []);

  return { lastSync, online, now };
}
