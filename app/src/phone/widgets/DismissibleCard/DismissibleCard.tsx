'use client';

// A phone call-to-action card that can be put away: a small close button
// (top right, 44px tap area) or a swipe either way past a third of its
// width, with the same axis lock as SwipeableListItem so the page still
// scrolls. The caller decides what dismissing means
// (src/shared/hooks/useDismissedCard.ts).

import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { useDismissedCard } from '@/src/shared/hooks/useDismissedCard';
import type { CardState } from '@/src/shared/settings/dismissals';
import styles from '@/src/phone/widgets/DismissibleCard/DismissibleCard.module.css';

const AXIS_LOCK_THRESHOLD = 6;

export function DismissibleCard({
  children,
  onDismiss,
  label,
  className,
  tone,
}: {
  children: ReactNode;
  onDismiss: () => void;
  label: string;
  className?: string;
  /** Passed on as data-tone, for cards styled by tone. */
  tone?: string;
}) {
  const [dragX, setDragX] = useState(0);
  const [leaving, setLeaving] = useState(0);
  const start = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const [width, setWidth] = useState(320);

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    start.current = { x: e.clientX, y: e.clientY, axis: null };
    setWidth(e.currentTarget.offsetWidth || 320);
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < AXIS_LOCK_THRESHOLD && Math.abs(dy) < AXIS_LOCK_THRESHOLD) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (s.axis === 'x') setDragX(dx);
  }
  function up() {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== 'x') return;
    if (Math.abs(dragX) > width / 3) {
      setLeaving(dragX > 0 ? 1 : -1);
      window.setTimeout(onDismiss, 150);
    } else setDragX(0);
  }

  const x = leaving ? leaving * width * 1.2 : dragX;
  return (
    <div
      className={`${styles.card} ${className ?? ''}`}
      style={{ transform: x ? `translateX(${x}px)` : undefined, opacity: x ? Math.max(0.2, 1 - Math.abs(x) / (width * 1.2)) : undefined }}
      data-tone={tone}
      data-dragging={dragX !== 0 && !leaving ? true : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setDragX(0);
      }}
    >
      {children}
      <button type="button" className={styles.close} aria-label={`Hide ${label}`} onClick={onDismiss}>
        <X size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/** A card that hides itself while its dismissed state holds (src/shared/hooks/useDismissedCard.ts). */
export function DismissibleCta({
  cardId,
  state,
  label,
  toast,
  className,
  tone,
  children,
}: {
  cardId: string;
  state: CardState;
  label: string;
  toast: string;
  className?: string;
  tone?: string;
  children: ReactNode;
}) {
  const card = useDismissedCard(cardId, state);
  if (card.hidden) return null;
  return (
    <DismissibleCard className={className} tone={tone} label={label} onDismiss={() => card.dismiss(toast)}>
      {children}
    </DismissibleCard>
  );
}
