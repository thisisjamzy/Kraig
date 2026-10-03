'use client';

// Opening a row or card: Notion's peek modes — a side peek (a right panel,
// about 560px, the page still visible beside it), a center peek (a dialog),
// or straight to the full page. The choice is remembered for every
// database. usePeek gives a page the open/close state and the mode-aware
// "open" that goes to the full page when that's the chosen mode.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Maximize2, PanelRight, Square, X } from 'lucide-react';
import { readPeekMode, writePeekMode, type PeekMode } from './useDatabaseState';
import styles from './Database.module.css';

export function usePeek<T>(hrefOf: (row: T) => string) {
  const router = useRouter();
  const [row, setRow] = useState<T | null>(null);
  const [mode, setModeState] = useState<PeekMode>('side');
  useEffect(() => {
    const frame = requestAnimationFrame(() => setModeState(readPeekMode()));
    return () => cancelAnimationFrame(frame);
  }, []);
  return {
    row,
    mode,
    open: (next: T) => {
      if (mode === 'full') router.push(hrefOf(next));
      else setRow(next);
    },
    close: () => setRow(null),
    setMode: (next: PeekMode) => {
      setModeState(next);
      writePeekMode(next);
      if (next === 'full' && row) router.push(hrefOf(row));
    },
    href: row ? hrefOf(row) : null,
  };
}

export function SidePeek({
  title,
  mode,
  onMode,
  onClose,
  fullHref,
  actions,
  children,
}: {
  title: string;
  mode: PeekMode;
  onMode: (mode: PeekMode) => void;
  onClose: () => void;
  fullHref: string | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      // An open menu or a cell editor takes Escape first.
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[data-lq-portal]')) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.peekOverlay} data-mode={mode}>
      <button type="button" className={styles.peekBackdrop} aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={ref} className={styles.peek} data-mode={mode} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-panel-open>
        <div className={styles.peekBar}>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X size={17} strokeWidth={2} />
          </button>
          {fullHref && (
            <Link href={fullHref} className={styles.iconButton} aria-label="Open as full page" title="Open as full page">
              <Maximize2 size={15} strokeWidth={2} />
            </Link>
          )}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={mode === 'side' ? 'Open as center peek' : 'Open as side peek'}
            title={mode === 'side' ? 'Center peek' : 'Side peek'}
            onClick={() => onMode(mode === 'side' ? 'center' : 'side')}
          >
            {mode === 'side' ? <Square size={15} strokeWidth={2} /> : <PanelRight size={15} strokeWidth={2} />}
          </button>
          <span className={styles.peekSpacer} />
          {actions}
        </div>
        <div className={styles.peekBody}>{children}</div>
      </div>
    </div>
  );
}
