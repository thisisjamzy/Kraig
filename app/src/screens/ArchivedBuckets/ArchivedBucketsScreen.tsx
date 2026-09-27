'use client';

import { useState } from 'react';
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/archivedBuckets/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { formatAmount } from '@/src/screens/Buckets/BucketsScreen';
import styles from './ArchivedBucketsScreen.module.css';

export function ArchivedBucketsScreen() {
  const strings = useStrings();
  const { buckets, restoreBucket, deleteBucket, deleteError, goBack, loading, error } = useLogic();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.archivedBuckets.title}
      />

      <p className={styles.hintText}>{strings.archivedBuckets.hint}</p>

      <ScreenState loading={loading} error={error} />
      {deleteError && <p className={styles.errorText}>{deleteError}</p>}

      {!loading && !error && buckets.length === 0 && <p className={styles.emptyText}>{strings.archivedBuckets.empty}</p>}

      {!loading && !error && buckets.length > 0 && (
        <div className={styles.list}>
          {buckets.map((bucket) => (
            <div key={bucket.id} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowName}>{bucket.name}</span>
                <span className={styles.rowAmount}>
                  {formatAmount(bucket.total)} {bucket.currency}
                </span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.restoreButton}
                  onClick={() => restoreBucket(bucket.id)}
                  aria-label={strings.archivedBuckets.restoreAction}
                >
                  <RotateCcw size={14} strokeWidth={2} />
                  {strings.archivedBuckets.restoreAction}
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setConfirmDeleteId(bucket.id)}
                  aria-label={strings.archivedBuckets.deleteAction}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  {strings.archivedBuckets.deleteAction}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title={strings.archivedBuckets.deleteConfirmTitle}
          message={strings.archivedBuckets.deleteConfirmMessage}
          confirmLabel={strings.archivedBuckets.deleteAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            deleteBucket(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
