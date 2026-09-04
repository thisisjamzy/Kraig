'use client';

// A small "⋮" trigger, same shell/behavior as ActionMenu (anchored popover,
// closes on outside click/Escape), but for a task specifically: unlike
// ActionMenu's flat list of one-shot actions, this needs live-updating
// toggle state (status/priority) plus a date input, so it's its own
// component rather than a set of ActionMenuItems. Self-contained — reads
// the signed-in uid itself and writes directly via taskWrites.ts — so it
// drops into any task row (TaskCard, ProjectDetail, the Calendar agenda)
// with just the task's own id/priority/done/dueDate, no plumbing required
// from the parent screen. Live Firestore listeners on every one of those
// screens mean a write here is reflected back into this same popover's
// props moments later — no local optimistic state needed for status/priority.

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { updateTaskDone, updateTaskPriority, rescheduleTask, toDateOnly } from '@/src/shared/firestore/taskWrites';
import { DateField } from '@/src/widgets/DateField/DateField';
import { PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import type { Priority } from '@/src/shared/firestore/types';
import styles from './TaskQuickActionsMenu.module.css';

export function TaskQuickActionsMenu({
  taskId,
  priority,
  done,
  dueDate,
}: {
  taskId: string;
  priority: Priority;
  done: boolean;
  dueDate: Date | null;
}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [open, setOpen] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reseed the date input fresh every time the popover opens, rather than
  // keeping it permanently in sync with the `dueDate` prop — that would
  // clobber whatever the user is mid-typing if a live snapshot update lands
  // while the popover is open.
  useEffect(() => {
    if (open) setRescheduleValue(dueDate ? toDateOnly(dueDate) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open]);

  async function handleDoneChange(next: boolean) {
    if (!uid || next === done) return;
    await updateTaskDone(uid, taskId, next);
  }

  async function handlePriorityChange(next: Priority) {
    if (!uid || next === priority) return;
    await updateTaskPriority(uid, taskId, next);
  }

  // DateField confirms as soon as a day is picked (no separate save step
  // the way the old native date input needed).
  async function handleReschedule(newDate: string) {
    if (!uid || saving || !newDate) return;
    setRescheduleValue(newDate);
    setSaving(true);
    await rescheduleTask(uid, taskId, newDate);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label="Task actions"
        aria-expanded={open}
      >
        <MoreVertical size={16} strokeWidth={2} />
      </button>

      {open && (
        <div className={styles.popover} onClick={(event) => event.stopPropagation()}>
          <p className={styles.groupLabel}>Status</p>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={done}
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
                className={`${styles.chip} ${priority === option ? styles.chipActive : ''}`}
                onClick={() => handlePriorityChange(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <p className={styles.groupLabel}>Reschedule</p>
          <DateField id={`task-reschedule-${taskId}`} label="New date" value={rescheduleValue} onChange={handleReschedule} />
          {saving && <p className={styles.savingHint}>Saving…</p>}
        </div>
      )}
    </div>
  );
}
