'use client';

import { useLogic } from '@/src/logic/focus/useLogic';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import type { FocusPriorityFilter } from '@/src/logic/focus/useLogic';
import styles from './FocusScreen.module.css';

const FILTERS: FocusPriorityFilter[] = ['All', ...PRIORITY_LEVELS];

export function FocusScreen() {
  const { priorityGroups, priorityFilter, setPriorityFilter, visiblePriorities, successTrend, todaySuccess, timeLeftToday, openTask, loading } =
    useLogic();

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Focus</h1>

      <div className={styles.filterRow}>
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`${styles.filterChip} ${priorityFilter === filter ? styles.filterChipActive : ''}`}
            onClick={() => setPriorityFilter(filter)}
          >
            {filter === 'All' ? 'All' : `${filter} priority`}
          </button>
        ))}
      </div>

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

          {visiblePriorities.map((priority) => {
            const items = priorityGroups[priority];
            if (items.length === 0) return null;
            return (
              <div key={priority}>
                {priorityFilter === 'All' && (
                  <div className={styles.sectionTitleRow}>
                    <h2 className={styles.chartTitle}>{priority} priority</h2>
                  </div>
                )}
                <div className={styles.list}>
                  {items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={{ id: task.id, title: task.title, priority, done: false, startTime: task.startTime, dueDate: task.dueDate }}
                      onClick={() => openTask(task.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {visiblePriorities.every((priority) => priorityGroups[priority].length === 0) && (
            <p className={styles.emptyText}>Nothing left to complete. Nice work.</p>
          )}
        </>
      )}
    </div>
  );
}
