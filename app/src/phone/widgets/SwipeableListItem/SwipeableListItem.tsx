'use client';

// A vertical list row that reveals a red delete action when swiped
// horizontally, either direction — the delete button sits fixed behind the
// row on whichever side the row got dragged away from, iOS-Mail style.
// Built as its own widget (rather than baked into one screen) so any
// future swipe-to-delete list can reuse it as-is. An action exists only
// while the row is dragged toward it: at rest nothing shows behind the
// row, even if the row itself isn't opaque.

import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Trash2 } from 'lucide-react';
import styles from '@/src/phone/widgets/SwipeableListItem/SwipeableListItem.module.css';

const REVEAL_WIDTH = 76;
const SWIPE_THRESHOLD = 38;
// Below this many pixels of movement, a touch/pointer is still a tap, not
// a drag yet — lets the axis lock (below) tell a horizontal swipe apart
// from the page's own vertical scroll before committing to either.
const AXIS_LOCK_THRESHOLD = 6;

/** An action revealed by swiping one way (Notifications: archive, mark read). */
export interface SwipeAction {
  label: string;
  icon: ReactNode;
  tone?: 'danger' | 'brand' | 'neutral';
  onSelect: () => void;
}

export function SwipeableListItem({
  children,
  onDelete,
  deleteLabel = 'Delete',
  swipeLeft,
  swipeRight,
  className,
  contentClassName,
}: {
  children: ReactNode;
  /** Both directions reveal Delete, unless a side has its own action. */
  onDelete?: () => void;
  deleteLabel?: string;
  /** Revealed when the row is swiped to the left (shown on the right). */
  swipeLeft?: SwipeAction;
  /** Revealed when the row is swiped to the right (shown on the left). */
  swipeRight?: SwipeAction;
  className?: string;
  /** The sliding row's own class (its card surface). */
  contentClassName?: string;
}) {
  const deleteAction: SwipeAction | undefined = onDelete ? { label: deleteLabel, icon: <Trash2 size={18} strokeWidth={2} />, tone: 'danger', onSelect: onDelete } : undefined;
  const leftAction = swipeLeft ?? deleteAction;
  const rightAction = swipeRight ?? deleteAction;
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
    const next = Math.max(leftAction ? -REVEAL_WIDTH : 0, Math.min(rightAction ? REVEAL_WIDTH : 0, baseXRef.current + deltaX));
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
      {leftAction && dragX < 0 && (
        <div className={`${styles.actions} ${styles.actionsRight}`}>
          <button
            type="button"
            className={styles.deleteButton}
            data-tone={leftAction.tone ?? 'danger'}
            aria-label={leftAction.label}
            tabIndex={0}
            onClick={() => {
              close();
              leftAction.onSelect();
            }}
          >
            {leftAction.icon}
          </button>
        </div>
      )}
      {rightAction && dragX > 0 && (
        <div className={`${styles.actions} ${styles.actionsLeft}`}>
          <button
            type="button"
            className={styles.deleteButton}
            data-tone={rightAction.tone ?? 'danger'}
            aria-label={rightAction.label}
            tabIndex={0}
            onClick={() => {
              close();
              rightAction.onSelect();
            }}
          >
            {rightAction.icon}
          </button>
        </div>
      )}
      <div
        className={`${styles.content} ${contentClassName ?? ''}`}
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
