'use client';

// A task as one line of a checklist — THE task card, used everywhere a task
// is listed (Time hub, Calendar, project/area pages, Focus board, All
// tasks) and identical in all of them. Radio on the left completes it in
// place (taskWrites.ts's updateTaskDone, same write TaskCard's own done
// checkbox uses); the rest of the row opens the task's edit page. Reading
// order, top to bottom: how urgent it is (priority + overdue badges), what
// it is (title, wrapping), when it is (date · time).
//
// Deliberately lighter than TaskCard: no inline edit panel, no action menu
// — a checklist row is for ticking off, the task's own page for editing.
//
// className/style let a listing place it (the Calendar positions each card
// on its hour timeline) without changing how it looks.

import { useState } from 'react';
import Link from 'next/link';
import { Check, Clock3, Layers, Lock, Repeat } from 'lucide-react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { updateTaskDone } from '@/src/shared/firestore/taskWrites';
import { priorityLabel } from '@/src/viewmodels/projects';
import type { Priority, TimeMode } from '@/src/shared/firestore/types';
import styles from './TaskCheckRow.module.css';

export interface TaskCheckRowTask {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  startTime: Date | null;
  dueDate: Date | null;
  // See FirestoreTask.allDay — shown as just its day ("Today").
  allDay?: boolean;
  // Time blocking — a tiny lock (blocked) or layers (free) by the time.
  timeMode?: TimeMode;
  // One date of a recurring series — a small repeat icon by the time. Its
  // id is then "seriesId@YYYY-MM-DD": ticking it completes that date only
  // (taskWrites.ts), and it opens that date in the edit form.
  recurring?: boolean;
  // Past its end time and not done — computed by the listing (which owns
  // "now"), so this row stays a pure render.
  overdue?: boolean;
  // "Project · Section · Area" — for listings that mix tasks from many
  // places (All tasks); leave out where it's already obvious.
  context?: string | null;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Today · 9:00 AM – 10:30 AM", "Today · 5:00 PM", or null with no schedule.
 * timeOnly drops the day ("9:00 AM – 10:30 AM") where it's already obvious,
 * like the Calendar's schedule for one selected day; an all-day task then
 * reads "All day". */
export function taskWhen(startTime: Date | null, dueDate: Date | null, allDay = false, timeOnly = false): string | null {
  const anchor = startTime ?? dueDate;
  if (!anchor) return null;
  if (allDay) return timeOnly ? 'All day' : dayLabel(anchor);
  const time =
    startTime && dueDate
      ? startTime.toDateString() === dueDate.toDateString()
        ? `${formatTime(startTime)} – ${formatTime(dueDate)}`
        : `${formatTime(startTime)} – ${dayLabel(dueDate)} ${formatTime(dueDate)}`
      : formatTime(anchor);
  return timeOnly ? time : `${dayLabel(anchor)} · ${time}`;
}

/** Blocked: owns its window. Free: can share it (src/viewmodels/scheduling.ts). */
export function ModeIcon({ mode }: { mode: TimeMode }) {
  return mode === 'blocked' ? (
    <Lock size={11} strokeWidth={2.5} aria-label="blocked time" role="img" />
  ) : (
    <Layers size={11} strokeWidth={2.5} aria-label="free time" role="img" />
  );
}

export function TaskCheckRow({
  task,
  timeOnly = false,
  className,
  style,
}: {
  task: TaskCheckRowTask;
  // Show just the time, not the day — the listing is already one day.
  timeOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [saving, setSaving] = useState(false);
  const when = taskWhen(task.startTime, task.dueDate, task.allDay, timeOnly);
  const overdue = Boolean(task.overdue) && !task.done;

  async function toggle() {
    if (!uid || saving) return;
    setSaving(true);
    try {
      await updateTaskDone(uid, task.id, !task.done);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`${styles.row} ${className ?? ''}`}
      data-done={task.done || undefined}
      style={style}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        className={styles.check}
        data-priority={task.priority}
        onClick={toggle}
        disabled={saving}
      >
        <Check size={14} strokeWidth={3} className={styles.checkIcon} />
      </button>
      <Link href={`/tasks/${task.id}/edit`} className={styles.body}>
        <span className={styles.badges}>
          <span className={styles.priority} data-priority={task.priority}>
            {priorityLabel(task.priority)}
          </span>
          {overdue && <span className={styles.overdue}>Overdue</span>}
        </span>
        <span className={styles.title}>{task.title}</span>
        {when && (
          <span className={styles.when} data-overdue={overdue || undefined}>
            <Clock3 size={12} strokeWidth={2.25} aria-hidden />
            {when}
            {task.timeMode && !task.allDay && <ModeIcon mode={task.timeMode} />}
            {task.recurring && <Repeat size={11} strokeWidth={2.5} aria-label="repeats" role="img" />}
          </span>
        )}
        {task.context && <span className={styles.context}>{task.context}</span>}
      </Link>
    </div>
  );
}
