'use client';

// Library on a phone: the same body under the usual header.

import { ChevronLeft } from 'lucide-react';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { LibraryBody } from '@/src/widgets/Library/Library';
import styles from '@/src/phone/screens/People/People.module.css';

export function LibraryScreen() {
  const goBack = useGoBack();
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.round} onClick={() => goBack('/projects')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Library"
      />
      <div className={styles.body}>
        <LibraryBody />
      </div>
    </div>
  );
}
