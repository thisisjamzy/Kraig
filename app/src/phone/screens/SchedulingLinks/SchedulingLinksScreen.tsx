'use client';

// Scheduling links on a phone: the usual screen header over the shared body,
// links first, the create form below.

import { ChevronLeft } from 'lucide-react';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { SchedulingLinksBody } from '@/src/widgets/SchedulingLinks/SchedulingLinksBody';
import styles from '@/src/phone/screens/SchedulingLinks/SchedulingLinksScreen.module.css';

export function SchedulingLinksScreen() {
  const goBack = useGoBack();
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.back} onClick={() => goBack('/projects/calendar')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Scheduling links"
      />
      <div className={styles.body}>
        <SchedulingLinksBody />
      </div>
    </div>
  );
}
