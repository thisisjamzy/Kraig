'use client';

// A right side panel for details and forms (medium screens and up), with
// its own close button and scroll. `overlay` (the default) slides over the
// page with a dim backdrop; `pinned` (large screens) sits beside the
// content instead and leaves the page usable. Escape closes it; focus
// moves into it on open and back where it was on close.

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './SidePanel.module.css';

export function SidePanel({
  title,
  onClose,
  width = 440,
  pinned = false,
  children,
}: {
  title: string;
  onClose: () => void;
  width?: number;
  pinned?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const panel = (
    <div
      ref={ref}
      className={styles.panel}
      data-pinned={pinned || undefined}
      style={{ width }}
      role={pinned ? 'complementary' : 'dialog'}
      aria-modal={pinned ? undefined : true}
      aria-label={title}
      tabIndex={-1}
      data-panel-open
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close" title="Close (Esc)">
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );

  if (pinned) return panel;
  return (
    <div className={styles.overlay}>
      <button type="button" className={styles.backdrop} aria-label="Close panel" tabIndex={-1} onClick={onClose} />
      {panel}
    </div>
  );
}
