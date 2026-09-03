'use client';

import { Target } from 'lucide-react';
import type { Priority } from '@/src/shared/firestore/types';
import styles from './TaskCard.module.css';

export interface TaskCardTask {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  startTime: Date | null;
  dueDate: Date | null;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}
function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/** "Sep 03, 9:00 AM – 5:00 PM" for a same-day range, "Sep 03, 9:00 AM – Sep
 * 04, 5:00 PM" spanning two days, or the existing single-timestamp format
 * when there's no separate start (most tasks). */
function dateTimeLabel(task: TaskCardTask): string | null {
  const { startTime, dueDate } = task;
  if (startTime && dueDate) {
    return sameDay(startTime, dueDate)
      ? `${formatDate(startTime)}, ${formatTime(startTime)} – ${formatTime(dueDate)}`
      : `${formatDate(startTime)}, ${formatTime(startTime)} – ${formatDate(dueDate)}, ${formatTime(dueDate)}`;
  }
  if (startTime) return `${formatDate(startTime)}, ${formatTime(startTime)}`;
  if (dueDate) return `${formatDate(dueDate)} · ${formatTime(dueDate)}`;
  return null;
}

type Status = 'Done' | 'Overdue' | 'Due today' | 'Upcoming' | 'No date';

function statusOf(task: TaskCardTask): Status {
  if (task.done) return 'Done';
  if (!task.dueDate) return 'No date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (task.dueDate < today) return 'Overdue';
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return task.dueDate < tomorrow ? 'Due today' : 'Upcoming';
}

const STATUS_CLASS: Record<Status, string> = {
  Done: styles.statusDone,
  Overdue: styles.statusOverdue,
  'Due today': styles.statusDueToday,
  Upcoming: styles.statusUpcoming,
  'No date': styles.statusNoDate,
};

const PRIORITY_CLASS: Record<Priority, string> = {
  High: styles.priorityHigh,
  Medium: styles.priorityMedium,
  Low: styles.priorityLow,
};

export function TaskCard({ task, onClick }: { task: TaskCardTask; onClick: () => void }) {
  const label = dateTimeLabel(task);
  const status = statusOf(task);

  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <span className={styles.iconCircle}>
        <Target size={16} strokeWidth={2} />
      </span>
      <div className={styles.body}>
        <p className={`${styles.name} ${task.done ? styles.nameDone : ''}`}>{task.title}</p>
        {label && <p className={styles.dateTime}>{label}</p>}
        <div className={styles.badgeRow}>
          <span className={`${styles.badge} ${PRIORITY_CLASS[task.priority]}`}>{task.priority}</span>
          <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>{status}</span>
        </div>
      </div>
    </button>
  );
}
