'use client';

// The one header all three Buckets-app tabs (Home, Analytics, Board) render
// inline at the top of their own page — same "each screen owns its own
// header" convention every drill-down screen already follows, just reused
// identically across three screens instead of written once each. The title
// always reads "Buckets" — it doesn't rename itself per tab, the bottom nav
// already says which tab you're on. Carries the Month/All-time toggle
// every tab shares (src/shared/hooks/useBucketsRange.ts), and a back-chevron
// to Money mode's own Home, since Buckets has no mode-switch FAB of its own
// (BottomNav/ProjectsBottomNav's own end button) to get back out with.
//
// The month/date picker used to live here too, but that put it in this
// mini-app's own "app bar" — moved to its own row above the hero card on
// the Home tab instead (src/screens/Buckets/BucketsScreen.tsx), so this header
// stays just the title + range toggle for every tab.
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { BucketsRange } from '@/src/shared/hooks/useBucketsRange';
import styles from './BucketsHeader.module.css';

export function BucketsHeader({
  range,
  onChangeRange,
}: {
  range: BucketsRange;
  onChangeRange: (range: BucketsRange) => void;
}) {
  return (
    <header className={styles.header}>
      <Link href="/home" className={styles.backButton} aria-label="Back to Home">
        <ChevronLeft size={18} strokeWidth={2} />
      </Link>
      <h1 className={styles.title}>Buckets</h1>
      <div className={styles.rangeToggle}>
        <button
          type="button"
          className={`${styles.rangeSegment} ${range === 'month' ? styles.rangeSegmentActive : ''}`}
          onClick={() => onChangeRange('month')}
        >
          Month
        </button>
        <button
          type="button"
          className={`${styles.rangeSegment} ${range === 'all' ? styles.rangeSegmentActive : ''}`}
          onClick={() => onChangeRange('all')}
        >
          All time
        </button>
      </div>
    </header>
  );
}
