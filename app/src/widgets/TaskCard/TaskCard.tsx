'use client';

import { Target } from 'lucide-react';
import { TaskQuickActionsMenu } from '@/src/widgets/TaskQuickActionsMenu/TaskQuickActionsMenu';
import { formatTaskDateRange } from '@/src/shared/formatTaskDateRange';
import { iconTint } from '@/src/viewmodels/iconTint';
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

// Every TaskCard shows the same Target icon (no per-type icon here, unlike
// ProjectsCalendarScreen's agenda rows) — tinting the circle by the task's
// own priority instead of a fixed index at least varies it meaningfully
// (and by something the card already surfaces via the priority badge)
// rather than reading as one flat grey column down the list.
const PRIORITY_TINT_INDEX: Record<Priority, number> = { High: 7, Medium: 5, Low: 1 };

export function TaskCard({ task, onClick }: { task: TaskCardTask; onClick: () => void }) {
  const label = formatTaskDateRange(task.startTime, task.dueDate);
  const status = statusOf(task);

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span className={styles.iconCircle} style={{ background: iconTint(PRIORITY_TINT_INDEX[task.priority]) }}>
        <Target size={16} strokeWidth={2} />
      </span>
      <div className={styles.body}>
        <div className={styles.nameRow}>
          <p className={`${styles.name} ${task.done ? styles.nameDone : ''}`}>{task.title}</p>
          <span onClick={(event) => event.stopPropagation()}>
            <TaskQuickActionsMenu taskId={task.id} priority={task.priority} done={task.done} dueDate={task.dueDate} />
          </span>
        </div>
        {label && <p className={styles.dateTime}>{label}</p>}
        <div className={styles.badgeRow}>
          <span className={`${styles.badge} ${PRIORITY_CLASS[task.priority]}`}>{task.priority}</span>
          <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>{status}</span>
        </div>
      </div>
    </div>
  );
}
