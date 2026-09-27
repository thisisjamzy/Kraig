'use client';

// A floating menu anchored under the tapped icon or chip, aligned to its
// edge (flipping to the right edge when it would run off-screen): 12px
// corners, soft shadow, max 320px wide and 60% of the screen tall with its
// own scroll; a quick fade and scale-up. Under 360px wide the same content
// opens as a bottom sheet. Closes on a tap outside or Escape; arrow keys
// move between rows ([data-row]).

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ListQuery.module.css';

const SHEET_BELOW = 360;
const GAP = 6;
const MARGIN = 8;

export function Popover({
  anchor,
  label,
  onClose,
  wide = false,
  children,
}: {
  anchor: HTMLElement | null;
  label: string;
  onClose: () => void;
  /** The advanced rule builder needs more room. */
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Place it (written straight to the element — no re-render needed).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    function place() {
      if (!el) return;
      const vw = window.innerWidth;
      if (vw < SHEET_BELOW || !anchor) {
        el.dataset.sheet = 'true';
        el.style.cssText = '';
        return;
      }
      delete el.dataset.sheet;
      const r = anchor.getBoundingClientRect();
      const width = Math.min(el.offsetWidth || (wide ? 360 : 320), vw - MARGIN * 2);
      let left = r.left;
      if (left + width > vw - MARGIN) left = Math.max(MARGIN, r.right - width);
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(r.bottom + GAP)}px`;
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, wide]);

  // Focus the first row; close on outside taps and Escape.
  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus], [data-row], input, button');
    first?.focus({ preventScroll: true });
    function onDown(event: PointerEvent) {
      const target = event.target as Node;
      if (el?.contains(target) || anchor?.contains(target)) return;
      // A native <select>'s own dropdown or a nested portal isn't "outside".
      if ((target as HTMLElement).closest?.('[data-lq-portal]')) return;
      onCloseRef.current();
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [anchor]);

  useEffect(() => {
    return () => anchor?.focus?.({ preventScroll: true });
  }, [anchor]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    // Arrow keys inside a text or number field move its cursor instead.
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox') return;
    if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-row]') ?? []);
    if (!rows.length) return;
    event.preventDefault();
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
    rows[next]?.focus();
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        className={styles.popover}
        data-wide={wide || undefined}
        data-lq-portal
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
      {/* Dims the page behind the bottom-sheet form only (CSS). */}
      <div className={styles.scrim} aria-hidden />
    </>,
    document.body
  );
}
