'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

/**
 * A dialog. With `sheet` (Dreda v1.0 `Sheet` 53388, 53525): a bottom sheet
 * with a grabber and 24px top corners over a scrim at 40 percent of
 * neutral 900; the title is optional and there is no close button (tap
 * the scrim or press Escape).
 */
export function Modal({
  title,
  onClose,
  children,
  sheet = false,
  titleHidden = false,
}: {
  title?: string;
  /** Sheet: the title only names the dialog for screen readers. */
  titleHidden?: boolean;
  onClose: () => void;
  children: ReactNode;
  sheet?: boolean;
}) {
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet, onClose]);

  if (sheet) {
    return (
      <div className={styles.sheetBackdrop} onClick={onClose}>
        <div className={styles.bottomSheet} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
          <span className={styles.grabber} aria-hidden />
          {title && !titleHidden && <h2 className={styles.sheetTitle}>{title}</h2>}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
