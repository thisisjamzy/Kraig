'use client';

import { ChevronLeft, BellOff } from 'lucide-react';
import styles from './NotificationsScreen.module.css';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function NotificationsScreen() {
  const navigateBack = useGoBack();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => navigateBack('/home')} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Notifications</h1>
      </header>

      <div className={styles.emptyState}>
        <BellOff size={32} strokeWidth={1.5} />
        <p className={styles.emptyText}>Notifications are coming soon.</p>
      </div>
    </div>
  );
}
