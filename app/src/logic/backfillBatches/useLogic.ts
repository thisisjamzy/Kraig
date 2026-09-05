'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listBackfillBatches, deleteBackfillBatch, type BackfillBatch } from '@/src/shared/firestore/unaccountedBalance';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { ctx } = useCurrencyContext();

  const [batches, setBatches] = useState<BackfillBatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listBackfillBatches(uid);
      setBatches(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load backfilled transactions.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(batchId: string) {
    if (!uid || deletingId) return;
    setDeletingId(batchId);
    try {
      await deleteBackfillBatch(uid, batchId, ctx);
      setBatches((current) => current?.filter((b) => b.batchId !== batchId) ?? null);
    } finally {
      setDeletingId(null);
    }
  }

  function viewBatch(batchId: string) {
    router.push(`/transactions?backfillBatch=${batchId}`);
  }

  function goBack() {
    router.push('/settings/backfill');
  }

  return { batches, loading, error, deletingId, handleDelete, viewBatch, goBack };
}
