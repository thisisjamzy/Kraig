'use client';

import { LoaderCircle } from 'lucide-react';
import styles from './ScreenState.module.css';

// Shared loading/error presentation for the screens now reading through
// callAppsScript (PRD-BACKEND.md section 10) — every one of them has a
// network round trip that can be pending or fail, where before there was a
// static array that couldn't. The loading state is a spinner, not text —
// same LoaderCircle + animate-spin pattern as LoadingScreen's own splash;
// loadingLabel stays as the accessible name (role="status" + aria-label)
// rather than visible text.
export function ScreenState({
  loading,
  error,
  onRetry,
  loadingLabel = 'Loading…',
}: {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  loadingLabel?: string;
}) {
  if (loading) {
    return (
      <div className={styles.wrap} role="status" aria-label={loadingLabel}>
        <LoaderCircle size={28} className={`animate-spin ${styles.spinner}`} aria-hidden="true" />
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.wrap} role="alert">
        <span className={styles.error}>{error}</span>
        {onRetry && (
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  return null;
}
