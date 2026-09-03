'use client';

import { useLogic } from '@/src/logic/focus/useLogic';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import styles from './FocusScreen.module.css';

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}
function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function FocusScreen() {
  const { priorityGroups, successTrend, todaySuccess, timeLeftToday, openTask, loading } = useLogic();

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Focus</h1>

      <ScreenState loading={loading} />

      {!loading && (
        <>
          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>Success this week</p>
            <TrendChart points={successTrend} color="var(--color-brand)" />
          </div>

          <div className={styles.statGrid}>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Left today</span>
              <p className={styles.statValue}>{timeLeftToday}</p>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Today&apos;s success</span>
              <p className={styles.statValue}>{todaySuccess}%</p>
            </div>
          </div>

          {PRIORITY_LEVELS.map((priority) => {
            const items = priorityGroups[priority];
            if (items.length === 0) return null;
            return (
              <div key={priority}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.chartTitle}>{priority} priority</h2>
                </div>
                <div className={styles.list}>
                  {items.map((task) => (
                    <button key={task.id} type="button" className={styles.taskRow} onClick={() => openTask(task.id)}>
                      {task.emoji && <span className={styles.emojiSmall}>{task.emoji}</span>}
                      <p className={styles.taskTitle}>{task.title}</p>
                      {task.dueDate && (
                        <span className={task.overdue ? styles.taskMetaDanger : styles.taskMeta}>
                          {formatDate(task.dueDate)} · {formatTime(task.dueDate)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {PRIORITY_LEVELS.every((priority) => priorityGroups[priority].length === 0) && (
            <p className={styles.emptyText}>Nothing left to complete. Nice work.</p>
          )}
        </>
      )}
    </div>
  );
}
