'use client';

// A task as a card to plan (Dreda v1.0 `Task card` 52501): Today's Overdue
// and To plan lists, the Calendar's tray and the phone To plan sheet. A
// grip, the title, then the project tag and the length; on the right a red
// "2 days late" or the day it is due. With a mouse it drags onto a time
// grid (TASK_DRAG_TYPE), which blocks the time for it.

import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { labelHue } from '@/src/viewmodels/projects';
import { durationText } from '@/src/viewmodels/todayPlan';
import type { TaskRow } from '@/src/viewmodels/taskRow';
import { HueTag } from './TypePill';
import styles from './TaskTrayCard.module.css';

/** The drag type a time grid accepts (same as TimeGrid's TASK_DRAG_TYPE). */
export const TRAY_DRAG_TYPE = 'application/x-dreda-task';

export function TaskTrayCard({
  row,
  right,
  onOpen,
  draggable = true,
  faded,
}: {
  row: TaskRow;
  right?: ReactNode;
  onOpen: () => void;
  draggable?: boolean;
  /** Drawn faded: the card being dragged, or one placed a moment ago. */
  faded?: boolean;
}) {
  return (
    <div
      className={styles.card}
      data-faded={faded || undefined}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(TRAY_DRAG_TYPE, row.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      {draggable && <GripVertical size={16} strokeWidth={2} className={styles.grip} aria-hidden />}
      <button type="button" className={styles.body} onClick={onOpen}>
        <span className={styles.title}>{row.title}</span>
        <span className={styles.meta}>
          {row.projectName && <HueTag hue={labelHue(row.projectColor)}>{row.projectName}</HueTag>}
          {row.minutes > 0 && <span className={styles.length}>{durationText(row.minutes)}</span>}
          {right && <span className={styles.right}>{right}</span>}
        </span>
      </button>
    </div>
  );
}

/** "2 days late" with a red dot. */
export function LatePill({ children }: { children: ReactNode }) {
  return (
    <span className={styles.late}>
      <span className={styles.lateDot} aria-hidden />
      {children}
    </span>
  );
}

/** "Today", "Wed 18 Nov" on grey. */
export function DayChip({ children }: { children: ReactNode }) {
  return <span className={styles.day}>{children}</span>;
}
