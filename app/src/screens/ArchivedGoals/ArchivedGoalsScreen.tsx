'use client';

import { ChevronLeft, RotateCcw } from 'lucide-react';
import { useLogic } from '@/src/logic/archivedGoals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import styles from './ArchivedGoalsScreen.module.css';

export function ArchivedGoalsScreen() {
  const strings = useStrings();
  const { goals, restoreGoal, goBack, loading, error } = useLogic();

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
              <button
                type="button"
                className={styles.restoreButton}
                onClick={() => restoreGoal(goal.id)}
                aria-label={strings.archivedGoals.restoreAction}
              >
                <RotateCcw size={14} strokeWidth={2} />
                {strings.archivedGoals.restoreAction}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
