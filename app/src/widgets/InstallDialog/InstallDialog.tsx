'use client';

import { useEffect, useId, useState } from 'react';
import { Apple, Smartphone, X } from 'lucide-react';
import styles from './InstallDialog.module.css';

type Platform = 'android' | 'iphone';

const STEPS: Record<Platform, string[]> = {
  android: [
    'Open dreda.com in Chrome on your Android phone.',
    'Tap the three-dot menu at the top right.',
    'Choose "Add to Home screen" or "Install app".',
    'Tap Install, then open Dreda from your home screen.',
  ],
  iphone: [
    'Open dreda.com in Safari on your iPhone.',
    'Tap the Share icon at the bottom of the screen.',
    'Scroll down and tap "Add to Home Screen".',
    'Tap Add, then open Dreda from your home screen.',
  ],
};

interface InstallDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InstallDialog({ open, onClose }: InstallDialogProps) {
  const titleId = useId();
  const [platform, setPlatform] = useState<Platform>('android');

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.iconBadge} aria-hidden="true">
            <Smartphone size={20} />
          </span>
          <h2 id={titleId} className={styles.title}>
            Install Dreda
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className={styles.subtitle}>Add it to your home screen and use it like an app.</p>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={platform === 'android'}
            className={`${styles.tab} ${platform === 'android' ? styles.tabActive : ''}`}
            onClick={() => setPlatform('android')}
          >
            <Smartphone size={16} />
            Android
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={platform === 'iphone'}
            className={`${styles.tab} ${platform === 'iphone' ? styles.tabActive : ''}`}
            onClick={() => setPlatform('iphone')}
          >
            <Apple size={16} strokeWidth={0} fill="currentColor" />
            iPhone
          </button>
        </div>

        <ol className={styles.steps}>
          {STEPS[platform].map((text, index) => (
            <li key={text} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
