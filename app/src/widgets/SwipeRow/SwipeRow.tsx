'use client';

// A list row you can swipe: right reveals Edit, left reveals Delete
// (touch and pen only; a mouse keeps clicking through to the row). A
// short swipe springs back; past the threshold the action stays open
// until it's tapped, the row is tapped, or another row is swiped. Delete
// asks first, inline in the row, and shows why if it couldn't.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import styles from './SwipeRow.module.css';

const ACTION = 88;
const THRESHOLD = 56;
// One open row at a time: opening one closes the others.
const OPEN_EVENT = 'swiperow:open';

export function SwipeRow({
  children,
  editHref,
  onDelete,
  label,
}: {
  children: ReactNode;
  /** Swipe right: open the edit form. */
  editHref?: string | null;
  /** Swipe left: delete it (rejects with the reason it couldn't). */
  onDelete?: (() => Promise<void>) | null;
  /** What the row is, for the buttons' names. */
  label: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  const id = useId();

  useEffect(() => {
    function close(e: Event) {
      if ((e as CustomEvent<string>).detail !== id) {
        setOffset(0);
        setConfirming(false);
      }
    }
    window.addEventListener(OPEN_EVENT, close);
    return () => window.removeEventListener(OPEN_EVENT, close);
  }, [id]);

  const min = onDelete ? -ACTION : 0;
  const max = editHref ? ACTION : 0;
  if (min === 0 && max === 0) return <>{children}</>;

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' || busy) return;
    start.current = { x: e.clientX, y: e.clientY, base: offset, horizontal: null };
    moved.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!s.horizontal) {
        start.current = null;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    }
    moved.current = true;
    setOffset(Math.max(min - 24, Math.min(max + 24, s.base + dx)));
  }

  function onPointerEnd() {
    const s = start.current;
    start.current = null;
    if (!s?.horizontal) return;
    setDragging(false);
    setOffset((o) => (o >= THRESHOLD && max > 0 ? max : o <= -THRESHOLD && min < 0 ? min : 0));
    setConfirming(false);
    setError(null);
  }

  async function remove() {
    if (!onDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete it.');
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {/* Each action is drawn only while the row is moved its way, so it
          never shows through the list's rounded corners at rest. */}
      {offset > 0 && editHref && (
        <Link href={editHref} className={styles.edit} style={{ width: ACTION }} aria-label={`Edit ${label}`}>
          <Pencil size={18} strokeWidth={2} aria-hidden />
          Edit
        </Link>
      )}
      {offset < 0 && onDelete && (
        <button type="button" className={styles.delete} style={{ width: ACTION }} aria-label={`Delete ${label}`} onClick={() => setConfirming(true)}>
          <Trash2 size={18} strokeWidth={2} aria-hidden />
          Delete
        </button>
      )}
      <div
        className={styles.content}
        data-dragging={dragging || undefined}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          // A swipe isn't a tap; a tap on an open row closes it.
          if (moved.current || offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
            if (!dragging) setOffset(0);
          }
        }}
      >
        {children}
      </div>
      {confirming && (
        <div className={styles.confirm} role="alertdialog" aria-label={`Delete ${label}?`}>
          <span>{error ?? `Delete ${label}? Its amount comes back off the wallet.`}</span>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => {
              setConfirming(false);
              setOffset(0);
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </button>
          {!error && (
            <button type="button" className={styles.confirmDelete} onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
