'use client';

// Selecting transactions and transfers in a History list to delete them
// together, and deleting one from a swipe. Each one is deleted the same way as from its own page
// (aggregation.ts's deleteTransactionWithAggregation and
// deleteTransferWithAggregation), so its amount comes back off its wallet
// and the month's figures; one at a time, so they never contend for the
// same wallet. One that can't be deleted (a debt's record only entry, a
// frozen wallet) is skipped with its reason, the rest still go.

import { useState } from 'react';
import { deleteTransactionWithAggregation, deleteTransferWithAggregation } from '@/src/shared/firestore/aggregation';
import { useCurrencyContext } from '@/src/shared/firestore/queries';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { HistoryRow } from './rows';

export const rowKey = (row: Pick<HistoryRow, 'kind' | 'id'>) => `${row.kind}:${row.id}`;
/** Budget moves aren't records of their own. */
export const isSelectable = (row: HistoryRow) => row.kind === 'transaction' || row.kind === 'transfer';

export interface DeleteResult {
  deleted: number;
  failed: { name: string; reason: string }[];
}

export function useRecordSelection() {
  const { user } = useFirebaseUser();
  const { ctx } = useCurrencyContext();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<DeleteResult | null>(null);

  function toggle(row: HistoryRow) {
    if (!isSelectable(row)) return;
    setSelected((current) => {
      const next = new Set(current);
      const key = rowKey(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Every shown row, or none when they are all selected already. */
  function toggleAll(rows: HistoryRow[]) {
    const keys = rows.filter(isSelectable).map(rowKey);
    setSelected((current) => (keys.every((k) => current.has(k)) ? new Set() : new Set(keys)));
  }

  function start() {
    setResult(null);
    setSelecting(true);
  }

  function stop() {
    setSelecting(false);
    setSelected(new Set());
    setConfirmOpen(false);
  }

  /** Deletes one row (a swipe's Delete); rejects with the reason it couldn't. */
  async function deleteOne(row: HistoryRow) {
    const uid = user?.uid;
    if (!uid || !isSelectable(row)) return;
    if (row.kind === 'transfer') await deleteTransferWithAggregation(uid, row.id);
    else await deleteTransactionWithAggregation(uid, row.id, ctx);
  }

  /** Deletes the selected rows among `rows` (what the list shows). */
  async function deleteSelected(rows: HistoryRow[]) {
    const uid = user?.uid;
    if (!uid || deleting) return;
    const targets = rows.filter((r) => isSelectable(r) && selected.has(rowKey(r)));
    setDeleting(true);
    setDone(0);
    const failed: DeleteResult['failed'] = [];
    let deleted = 0;
    for (const row of targets) {
      try {
        if (row.kind === 'transfer') await deleteTransferWithAggregation(uid, row.id);
        else await deleteTransactionWithAggregation(uid, row.id, ctx);
        deleted += 1;
      } catch (err) {
        failed.push({ name: row.name, reason: err instanceof Error ? err.message : 'Could not delete it.' });
      }
      setDone((n) => n + 1);
    }
    setDeleting(false);
    setResult({ deleted, failed });
    setSelected(new Set());
    setConfirmOpen(false);
    if (failed.length === 0) setSelecting(false);
  }

  return {
    selecting,
    selected,
    isSelected: (row: HistoryRow) => selected.has(rowKey(row)),
    toggle,
    toggleAll,
    start,
    stop,
    confirmOpen,
    askDelete: () => setConfirmOpen(true),
    cancelDelete: () => setConfirmOpen(false),
    deleting,
    done,
    result,
    dismissResult: () => setResult(null),
    deleteSelected,
    deleteOne,
  };
}

export type RecordSelection = ReturnType<typeof useRecordSelection>;
