'use client';

import { useLogic } from '@/src/logic/focus/useLogic';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import type { FocusPriorityFilter, FocusDateFilter } from '@/src/logic/focus/useLogic';
import styles from './FocusScreen.module.css';

const PRIORITY_FILTERS: FocusPriorityFilter[] = ['All', ...PRIORITY_LEVELS];
const PRIORITY_FILTER_LABEL: Record<FocusPriorityFilter, string> = {
  All: 'All priorities',
  High: 'High priority',
  Medium: 'Medium priority',
  Low: 'Low priority',
};

const DATE_FILTERS: FocusDateFilter[] = ['all', 'today', 'thisWeek', 'thisMonth', 'lastWeek', 'lastMonth'];
const DATE_FILTER_LABEL: Record<FocusDateFilter, string> = {
  all: 'Any date',
  today: 'Today',
  thisWeek: 'This week',
  thisMonth: 'This month',
  lastWeek: 'Last week',
  lastMonth: 'Last month',
};

export function FocusScreen() {
  const {
    visibleTasks,
    priorityFilter,
    setPriorityFilter,
    dateFilter,
    setDateFilter,
    successTrend,
    todaySuccess,
    timeLeftToday,
    openTask,
    loading,
  } = useLogic();

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

          {/* Native <select>s rather than chip rows — always exactly one
              line regardless of screen width, left-aligned rather than
              stretched, same dropdown-for-a-single-choice pattern already
              used by TaskEdit's own project picker. */}
          <div className={styles.filterRow}>
            <select
              className={styles.filterSelect}
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as FocusPriorityFilter)}
              aria-label="Filter by priority"
            >
              {PRIORITY_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {PRIORITY_FILTER_LABEL[filter]}
                </option>
              ))}
            </select>
            <select
              className={styles.filterSelect}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as FocusDateFilter)}
              aria-label="Filter by due date"
            >
              {DATE_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {DATE_FILTER_LABEL[filter]}
                </option>
              ))}
            </select>
          </div>

          {visibleTasks.length === 0 ? (
            <p className={styles.emptyText}>Nothing left to complete. Nice work.</p>
          ) : (
            <div className={styles.list}>
              {visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => openTask(task.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
