'use client';

// A task row of Time v1.0's phone lists (`Task row` 52411, in Tasks /
// Phone and Today / Phone's Overdue): the round check, the title, on the
// right how late it is (red text, never a red block) or its length, an
// optional note under the title ("In progress", "Waiting on Ama"), then
// its tags: project, type pill, time block.

import type { ReactNode } from 'react';
import styles from '@/src/phone/widgets/TaskCheckRow/TaskLine.module.css';

export function TaskLine({
  title,
  done,
  onToggle,
  onOpen,
  right,
  late,
  note,
  tags,
}: {
  title: string;
  done: boolean;
  onToggle: () => void;
  onOpen: () => void;
  right?: ReactNode;
  /** The right text is a lateness: red. */
  late?: boolean;
  note?: string | null;
  tags?: ReactNode;
}) {
  return (
    <div className={styles.row} data-done={done || undefined}>
      <button type="button" className={styles.check} data-done={done || undefined} aria-pressed={done} aria-label={done ? `Mark ${title} not done` : `Mark ${title} done`} onClick={onToggle} />
      <button type="button" className={styles.body} onClick={onOpen}>
        <span className={styles.top}>
          <span className={styles.title}>{title}</span>
          {right && (
            <span className={styles.right} data-late={late || undefined}>
              {right}
            </span>
          )}
        </span>
        {note && <span className={styles.note}>{note}</span>}
        {tags && <span className={styles.tags}>{tags}</span>}
      </button>
    </div>
  );
}
