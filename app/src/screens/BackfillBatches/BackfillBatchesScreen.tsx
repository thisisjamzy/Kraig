'use client';

import { useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/backfillBatches/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import type { BackfillBatch } from '@/src/shared/firestore/unaccountedBalance';
import styles from './BackfillBatchesScreen.module.css';

export function BackfillBatchesScreen() {
  const strings = useStrings();
  const s = strings.backfill;
  const { batches, loading, error, deletingId, handleDelete, viewBatch, goBack } = useLogic();
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState<BackfillBatch | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{s.batchesTitle}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && batches && batches.length === 0 && <p className={styles.emptyText}>{s.noBatches}</p>}

      {!loading && !error && batches && batches.length > 0 && (
        <div className={styles.list}>
          {batches.map((batch) => (
            <div key={batch.batchId} className={styles.row}>
              <div className={styles.info} onClick={() => viewBatch(batch.batchId)}>
                <span className={styles.title2}>
                  {batch.title}, {batch.startMonth} – {batch.endMonth}
                </span>
                <span className={styles.meta}>
                  {batch.count} {s.batchCountSuffix} · {formatAmount(batch.total)}
                </span>
              </div>
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={s.deleteBatch}
                disabled={deletingId === batch.batchId}
                onClick={() => setConfirmDeleteBatch(batch)}
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteBatch && (
        <ConfirmDialog
          title={s.deleteBatchConfirmTitle}
          message={s.deleteBatchConfirmMessage}
          confirmLabel={s.deleteBatch}
          cancelLabel={strings.common.cancel}
          onCancel={() => setConfirmDeleteBatch(null)}
          onConfirm={() => {
            handleDelete(confirmDeleteBatch.batchId);
            setConfirmDeleteBatch(null);
          }}
        />
      )}
    </div>
  );
}
