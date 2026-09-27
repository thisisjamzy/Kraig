'use client';

import { ChevronLeft, BellOff } from 'lucide-react';
import styles from './NotificationsScreen.module.css';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';

export function NotificationsScreen() {
  const navigateBack = useGoBack();

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={() => navigateBack('/home')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Notifications"
      />

      <div className={styles.emptyState}>
        <BellOff size={32} strokeWidth={1.5} />
        <p className={styles.emptyText}>Notifications are coming soon.</p>
      </div>
    </div>
  );
}
