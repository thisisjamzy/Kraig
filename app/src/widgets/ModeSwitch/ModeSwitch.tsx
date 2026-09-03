'use client';

// The Money/Time mode toggle — lives in AppHeader's toolbar (not either hub
// screen's own body, to keep both compact), a plain click alternative to
// the swipe gesture src/shared/hooks/useSwipeModeSwitch.ts provides on the
// same two hub screens. Either one gets you to the other mode.

import { useRouter } from 'next/navigation';
import styles from './ModeSwitch.module.css';

export function ModeSwitch({ active }: { active: 'money' | 'projects' }) {
  const router = useRouter();

  return (
    <div className={styles.pill}>
      <button
        type="button"
        className={`${styles.segment} ${active === 'money' ? styles.segmentActive : ''}`}
        onClick={() => router.push('/home')}
      >
        Money
      </button>
      <button
        type="button"
        className={`${styles.segment} ${active === 'projects' ? styles.segmentActive : ''}`}
        onClick={() => router.push('/projects')}
      >
        Time
      </button>
    </div>
  );
}
