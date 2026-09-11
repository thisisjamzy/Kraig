'use client';

// The one task card every task listing uses (Focus, All Tasks, Project
// Detail's own task list, the Calendar agenda, the Projects hub's Today's
// tasks list) — self-contained, like ProjectCard/BucketCard: reads the
// signed-in uid itself and writes directly via taskWrites.ts, so a parent
// screen only ever needs to hand it a TaskCardTask, nothing else.
//
// Visual spec is Design/task5.JPG's "Today's tasks" / "Schedule" cards: a
// colored accent bar down the card's left edge, the task's plain-language
// status under its name, a small overlapping badge stack bottom-left, and
// the scheduled time bottom-right.
//
// Three independent interactions:
// - The "⋮" trigger opens a small ActionMenu popover (Edit task / Delete
//   task) — a separate floating menu, not part of the card's own layout.
// - Clicking the card itself toggles an inline panel below the badges
//   (status, the done checkbox, priority, reschedule) — the card visually
//   grows to reveal it rather than anything overlaying the page. While
//   open, the "⋮" trigger itself becomes a close ("✕") button.
// - Clicking one of the two small badges (priority / schedule urgency)
//   expands just that one in place into a full labeled pill — same
//   "collapsed stack, tap one to see it fully" idea as an overlapping
//   avatar-group, applied to badges since this app has no per-task
//   assignees of its own to show. Stops propagation so it never also
//   toggles the card's own bigger edit panel.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, X, Pencil, Trash2 } from 'lucide-react';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { DateField } from '@/src/widgets/DateField/DateField';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import {
  updateTaskDone,
  updateTaskPriority,
  updateTaskStatus,
  rescheduleTask,
  archiveTask,
  toDateOnly,
} from '@/src/shared/firestore/taskWrites';
import { formatTaskDateRange } from '@/src/shared/formatTaskDateRange';
import { PRIORITY_LEVELS, TASK_STATUSES, resolveTaskStatus, taskCardColor } from '@/src/viewmodels/projects';
import type { Priority, TaskStatus } from '@/src/shared/firestore/types';
import styles from './TaskCard.module.css';

export interface TaskCardTask {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  status?: TaskStatus;
  startTime: Date | null;
  dueDate: Date | null;
  // Optional — omitted entirely by a listing already scoped to one of
  // these (a project's own task list has no reason to repeat that
  // project's name on every card), shown as a dot-separated row under the
  // status line wherever a task's context isn't otherwise obvious (Focus,
  // Today's tasks, the Calendar agenda, All Tasks).
  projectName?: string | null;
  bucketName?: string | null;
  areaName?: string | null;
}

// The plain-language status line under the task name — a simpler 3-state
// read of the workflow status than the Status editor's own 4 options
// (Pending/Stuck/In Review/Done) below, collapsed the way the mockup shows
// just "Upcoming" / "In Progress" / "Complete" under each card's title.
type DisplayStatus = 'Completed' | 'In Progress' | 'Upcoming';

function displayStatusOf(task: TaskCardTask): DisplayStatus {
  if (task.done) return 'Completed';
  const status = resolveTaskStatus(task);
  return status === 'Pending' ? 'Upcoming' : 'In Progress';
}

type ScheduleStatus = 'Done' | 'Overdue' | 'Due today' | 'Upcoming' | 'No date';

function scheduleStatusOf(task: TaskCardTask): ScheduleStatus {
  if (task.done) return 'Done';
  if (!task.dueDate) return 'No date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (task.dueDate < today) return 'Overdue';
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return task.dueDate < tomorrow ? 'Due today' : 'Upcoming';
}

const SCHEDULE_STATUS_CLASS: Record<ScheduleStatus, string> = {
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

type BadgeKey = 'priority' | 'schedule';

export function TaskCard({ task }: { task: TaskCardTask }) {
  const cardColor = taskCardColor(task.id);
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const status = resolveTaskStatus(task);
  const label = formatTaskDateRange(task.startTime, task.dueDate);
  const scheduleStatus = scheduleStatusOf(task);
  const displayStatus = displayStatusOf(task);

  const contextLabels = [task.projectName, task.bucketName, task.areaName].filter(
    (label): label is string => Boolean(label)
  );

  const [expanded, setExpanded] = useState(false);
  const [expandedBadge, setExpandedBadge] = useState<BadgeKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState(task.dueDate ? toDateOnly(task.dueDate) : '');
  const [saving, setSaving] = useState(false);

  const badges: { key: BadgeKey; label: string; letter: string; className: string }[] = [
    { key: 'priority', label: task.priority, letter: task.priority.charAt(0), className: PRIORITY_CLASS[task.priority] },
    { key: 'schedule', label: scheduleStatus, letter: scheduleStatus.charAt(0), className: SCHEDULE_STATUS_CLASS[scheduleStatus] },
  ];

  function toggleExpanded() {
    setExpanded((current) => {
      // Reseed the date input fresh every time the panel opens, rather
      // than keeping it permanently in sync with the `dueDate` prop —
      // that would clobber whatever the user is mid-typing if a live
      // snapshot update lands while it's open.
      if (!current) setRescheduleValue(task.dueDate ? toDateOnly(task.dueDate) : '');
      return !current;
    });
  }

  async function handleStatusChange(next: TaskStatus) {
    if (!uid || next === status) return;
    await updateTaskStatus(uid, task.id, next);
  }

  async function handleDoneChange(next: boolean) {
    if (!uid || next === task.done) return;
    await updateTaskDone(uid, task.id, next);
  }

  async function handlePriorityChange(next: Priority) {
    if (!uid || next === task.priority) return;
    await updateTaskPriority(uid, task.id, next);
  }

  // DateField confirms as soon as a day is picked (no separate save step
  // the way the old native date input needed).
  async function handleReschedule(newDate: string) {
    if (!uid || saving || !newDate) return;
    setRescheduleValue(newDate);
    setSaving(true);
    await rescheduleTask(uid, task.id, newDate);
    setSaving(false);
  }

  async function handleDelete() {
    if (!uid) return;
    await archiveTask(uid, task.id);
    setConfirmDelete(false);
  }

  return (
    <>
      <div
        className={styles.card}
        role="button"
        tabIndex={0}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <span className={styles.accentBar} style={{ background: cardColor }} aria-hidden="true" />
        <div className={styles.body}>
          <div className={styles.nameRow}>
            <p className={`${styles.name} ${task.done ? styles.nameDone : ''}`}>{task.title}</p>
            {expanded ? (
              <button
                type="button"
                className={styles.trigger}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(false);
                }}
                aria-label="Close task actions"
              >
                <X size={16} strokeWidth={2} />
              </button>
            ) : (
              <ActionMenu
                ariaLabel="Task actions"
                triggerIcon={<MoreVertical size={16} strokeWidth={2} />}
                triggerClassName={styles.trigger}
                items={[
                  {
                    key: 'edit',
                    label: 'Edit task',
                    icon: <Pencil size={14} strokeWidth={2} />,
                    onSelect: () => router.push(`/tasks/${task.id}/edit`),
                  },
                  {
                    key: 'delete',
                    label: 'Delete task',
                    icon: <Trash2 size={14} strokeWidth={2} />,
                    danger: true,
                    onSelect: () => setConfirmDelete(true),
                  },
                ]}
              />
            )}
          </div>

          <p className={`${styles.statusText} ${displayStatus === 'Completed' ? styles.statusTextDone : ''}`}>
            {displayStatus}
          </p>

          {contextLabels.length > 0 && (
            <div className={styles.contextRow}>
              {contextLabels.map((label, index) => (
                <span key={label} className={styles.contextItem}>
                  {index > 0 && <span className={styles.contextDot} aria-hidden="true" />}
                  {label}
                </span>
              ))}
            </div>
          )}

          {expanded && (
            <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
              <p className={styles.groupLabel}>Status</p>
              <div className={styles.chipGroup}>
                {TASK_STATUSES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.chip} ${status === option ? styles.chipActive : ''}`}
                    onClick={() => handleStatusChange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={task.done}
                  onChange={(event) => handleDoneChange(event.target.checked)}
                />
                Mark as complete
              </label>

              <p className={styles.groupLabel}>Priority</p>
              <div className={styles.chipGroup}>
                {PRIORITY_LEVELS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.chip} ${task.priority === option ? styles.chipActive : ''}`}
                    onClick={() => handlePriorityChange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <p className={styles.groupLabel}>Reschedule</p>
              <DateField
                id={`task-reschedule-${task.id}`}
                label="New date"
                value={rescheduleValue}
                onChange={handleReschedule}
              />
              {saving && <p className={styles.savingHint}>Saving…</p>}
            </div>
          )}

          <div className={styles.bottomRow}>
            <div className={styles.badgeStack}>
              {badges.map((badge, index) => (
                <button
                  key={badge.key}
                  type="button"
                  className={`${styles.badge} ${badge.className} ${expandedBadge === badge.key ? styles.badgeExpanded : ''}`}
                  style={{ zIndex: expandedBadge === badge.key ? badges.length + 1 : badges.length - index }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedBadge((current) => (current === badge.key ? null : badge.key));
                  }}
                  aria-label={badge.label}
                >
                  <span className={styles.badgeLetter}>{badge.letter}</span>
                  <span className={styles.badgeLabel}>{badge.label}</span>
                </button>
              ))}
            </div>
            {label && <span className={styles.dateTime}>{label}</span>}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this task?"
          message="It'll be removed from every list — this can't be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
