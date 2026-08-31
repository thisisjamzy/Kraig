'use client';

import { LoaderCircle } from 'lucide-react';
import { useLogic } from '@/src/logic/loading/useLogic';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './LoadingScreen.module.css';

export function LoadingScreen() {
  const { error } = useLogic();

  return (
    <div className={styles.page}>
      <Logo height={72} className={styles.logo} />
      <LoaderCircle size={28} className={`animate-spin ${styles.spinner}`} aria-hidden="true" />
      <p className={styles.label} role="status">
        {error ?? 'Getting your ledger ready…'}
      </p>
    </div>
  );
}
