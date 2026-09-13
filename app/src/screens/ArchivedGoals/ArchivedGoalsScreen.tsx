'use client';

import { useState } from 'react';
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/archivedGoals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import styles from './ArchivedGoalsScreen.module.css';

export function ArchivedGoalsScreen() {
  const strings = useStrings();
  const { goals, restoreGoal, deleteGoal, goBack, loading, error } = useLogic();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.archivedGoals.title}</h1>
      </header>

      <p className={styles.hintText}>{strings.archivedGoals.hint}</p>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && goals.length === 0 && <p className={styles.emptyText}>{strings.archivedGoals.empty}</p>}

      {!loading && !error && goals.length > 0 && (
        <div className={styles.list}>
          {goals.map((goal) => (
            <div key={goal.id} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowName}>{goal.name}</span>
                <span className={styles.rowAmount}>
                  {formatAmount(goal.total)} {goal.currency}
                </span>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.restoreButton}
                  onClick={() => restoreGoal(goal.id)}
                  aria-label={strings.archivedGoals.restoreAction}
                >
                  <RotateCcw size={14} strokeWidth={2} />
                  {strings.archivedGoals.restoreAction}
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setConfirmDeleteId(goal.id)}
                  aria-label={strings.archivedGoals.deleteAction}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  {strings.archivedGoals.deleteAction}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title={strings.archivedGoals.deleteConfirmTitle}
          message={strings.archivedGoals.deleteConfirmMessage}
          confirmLabel={strings.archivedGoals.deleteAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            deleteGoal(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
