'use client';

// Desktop/tablet-only wrapper for the PARA "create" screens (CreateArea,
// CreateProject, TaskEdit) — Design/web/Webpages/page2.webp's own pattern:
// on wide viewports the form opens as a fixed-width panel anchored to the
// right edge over a dimmed backdrop, instead of stretching across the
// whole content column the way it does on mobile. Each screen's own
// `.page` markup is untouched and simply renders inside this panel
// unchanged — every one of them already carries its own header with an X
// "close" button wired to that screen's own goBack, so this only needs
// the backdrop's click-outside-to-close, no header of its own.
//
// isWeb-gated by the caller, same convention as every other *.web split
// in this codebase (see HomeScreen.tsx) — never rendered for a mobile
// visitor.

import { useEffect, type MouseEvent, type ReactNode } from 'react';
import styles from './WebFormPanel.module.css';

/** `width` defaults to the task form's 480px; the debt forms use 560. */
export function WebFormPanel({ children, onClose, width = 480 }: { children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick} data-panel-open>
      <div className={styles.panel} style={{ width: `min(${width}px, 92vw)` }}>
        {children}
      </div>
    </div>
  );
}
