'use client';

// A vertical list row that reveals a red delete action when swiped
// horizontally, either direction — the delete button sits fixed behind the
// row on whichever side the row got dragged away from, iOS-Mail style.
// Built as its own widget (rather than baked into one screen) so any
// future swipe-to-delete list can reuse it as-is.

import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Trash2 } from 'lucide-react';
import styles from './SwipeableListItem.module.css';

const REVEAL_WIDTH = 76;
const SWIPE_THRESHOLD = 38;
// Below this many pixels of movement, a touch/pointer is still a tap, not
// a drag yet — lets the axis lock (below) tell a horizontal swipe apart
// from the page's own vertical scroll before committing to either.
const AXIS_LOCK_THRESHOLD = 6;

export function SwipeableListItem({
  children,
  onDelete,
  deleteLabel = 'Delete',
  className,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  className?: string;
}) {
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const baseXRef = useRef(0);
  const lockedAxisRef = useRef<'x' | 'y' | null>(null);
  const openRef = useRef(false);

  function close() {
    setDragX(0);
    openRef.current = false;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    draggingRef.current = true;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    baseXRef.current = dragX;
    lockedAxisRef.current = null;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;

    if (!lockedAxisRef.current) {
      if (Math.abs(deltaX) < AXIS_LOCK_THRESHOLD && Math.abs(deltaY) < AXIS_LOCK_THRESHOLD) return;
      lockedAxisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    }
    // Locked to a vertical drag — let the page scroll handle it instead.
    if (lockedAxisRef.current === 'y') return;

    event.preventDefault();
    const next = Math.max(-REVEAL_WIDTH, Math.min(REVEAL_WIDTH, baseXRef.current + deltaX));
    setDragX(next);
  }

  function handlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (lockedAxisRef.current !== 'x') {
      lockedAxisRef.current = null;
      return;
    }
    if (dragX <= -SWIPE_THRESHOLD) {
      setDragX(-REVEAL_WIDTH);
      openRef.current = true;
    } else if (dragX >= SWIPE_THRESHOLD) {
      setDragX(REVEAL_WIDTH);
      openRef.current = true;
    } else {
      close();
    }
    lockedAxisRef.current = null;
  }

  // While open, the row itself just closes the swipe on tap instead of
  // following its own link/onClick through — same convention as every
  // other swipe-to-delete list (Mail, most todo apps).
  function handleContentClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (openRef.current) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      <div className={`${styles.actions} ${styles.actionsRight}`} aria-hidden={dragX >= 0}>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={deleteLabel}
          tabIndex={dragX < 0 ? 0 : -1}
          onClick={() => {
            close();
            onDelete();
          }}
        >
          <Trash2 size={18} strokeWidth={2} />
        </button>
      </div>
      <div className={`${styles.actions} ${styles.actionsLeft}`} aria-hidden={dragX <= 0}>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={deleteLabel}
          tabIndex={dragX > 0 ? 0 : -1}
          onClick={() => {
            close();
            onDelete();
          }}
        >
          <Trash2 size={18} strokeWidth={2} />
        </button>
      </div>
      <div
        className={styles.content}
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
