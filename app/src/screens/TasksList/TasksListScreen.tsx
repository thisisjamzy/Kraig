'use client';

import { ChevronLeft } from 'lucide-react';
import {
  useLogic,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  PRIORITY_FILTERS,
  PRIORITY_FILTER_LABEL,
} from '@/src/logic/tasksList/useLogic';
import type { TaskStatusFilter, TaskPriorityFilter } from '@/src/logic/tasksList/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import styles from './TasksListScreen.module.css';

export function TasksListScreen() {
  const { title, tasks, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter, goBack, loading } =
    useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <div className={styles.filterRow}>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TaskStatusFilter)}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {STATUS_FILTER_LABEL[filter]}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as TaskPriorityFilter)}
          aria-label="Filter by priority"
        >
          {PRIORITY_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {PRIORITY_FILTER_LABEL[filter]}
            </option>
          ))}
        </select>
      </div>

      <ScreenState loading={loading} />

      {!loading && (
        <>
          {tasks.length === 0 ? (
            <p className={styles.emptyText}>Nothing here.</p>
          ) : (
            <div className={styles.list}>
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
