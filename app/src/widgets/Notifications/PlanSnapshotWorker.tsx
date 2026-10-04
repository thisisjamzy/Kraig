'use client';

// Once a day, on the first open: works out the applied plan's forecast
// (breaches of the cushion, months that don't fit, backlog items that now
// fit, the cushion streak) and audits account balances, and saves them as
// settings/planSnapshot for the notification runner. Only mounts the heavy
// plan model (every transaction) when the snapshot is due, then lets go of
// it. The Plan and forecast page keeps the forecast part fresh whenever
// it's open.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { planSnapshotRef } from '@/src/shared/firestore/refs';
import { savePlanSnapshot } from '@/src/shared/firestore/notificationWrites';
import { auditAccountBalances } from '@/src/shared/firestore/reconciliation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { usePlanModel } from '@/src/logic/plansForecast/usePlanModel';
import type { Timestamp } from 'firebase/firestore';

const DUE_AFTER_MS = 20 * 3600_000;
const TRIED_KEY = 'dreda.planSnapshot.tried';

export function PlanSnapshotWorker() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: snapshot, loading } = useFirestoreDoc<{ computedAt?: Timestamp }>(useMemo(() => (uid ? planSnapshotRef(uid) : null), [uid]));
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!uid || loading || working) return;
    const at = snapshot?.computedAt?.toMillis() ?? 0;
    if (Date.now() - at < DUE_AFTER_MS) return;
    // One try per day per device, even if it fails.
    const today = new Date().toDateString();
    try {
      if (localStorage.getItem(TRIED_KEY) === today) return;
      localStorage.setItem(TRIED_KEY, today);
    } catch {
      // Not remembered: tried again next open, still at most once a session.
    }
    const frame = requestAnimationFrame(() => setWorking(true));
    return () => cancelAnimationFrame(frame);
  }, [uid, loading, snapshot, working]);

  if (!uid || !working) return null;
  return <Compute uid={uid} onDone={() => setWorking(false)} />;
}

function Compute({ uid, onDone }: { uid: string; onDone: () => void }) {
  const model = usePlanModel();
  const started = useRef(false);
  useEffect(() => {
    if (model.loading || started.current) return;
    started.current = true;
    (async () => {
      try {
        const audit = await auditAccountBalances(uid).catch(() => null);
        await savePlanSnapshot(uid, {
          computedAt: new Date(),
          forecast: model.forecastFacts,
          ...(audit ? { reconcile: audit.accounts.filter((a) => !a.archived && a.difference !== 0).map((a) => ({ accountId: a.accountId, name: a.name, difference: a.difference })) } : {}),
        });
      } catch (error) {
        console.error('[plan] snapshot failed', error);
      } finally {
        onDone();
      }
    })();
  }, [model.loading, model.forecastFacts, uid, onDone]);
  return null;
}
