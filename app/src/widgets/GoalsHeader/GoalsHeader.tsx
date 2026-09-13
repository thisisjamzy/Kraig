'use client';

// The one header all three Goals-app tabs (Home, Analytics, Board) render
// inline at the top of their own page — same "each screen owns its own
// header" convention every drill-down screen already follows, just reused
// identically across three screens instead of written once each. The title
// always reads "Goals" — it doesn't rename itself per tab, the bottom nav
// already says which tab you're on. Carries the Month/All-time toggle
// every tab shares (src/shared/hooks/useGoalsRange.ts), sized and placed
// exactly like AppHeader's own ModeSwitch (Money/Time), and a back-chevron
// to Money mode's own Home, since Goals has no ModeSwitch slot of its own
// to get back out with.
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { GoalsRange } from '@/src/shared/hooks/useGoalsRange';
import styles from './GoalsHeader.module.css';

export function GoalsHeader({
  range,
  onChangeRange,
}: {
  range: GoalsRange;
  onChangeRange: (range: GoalsRange) => void;
}) {
  return (
    <header className={styles.header}>
      <Link href="/home" className={styles.backButton} aria-label="Back to Home">
        <ChevronLeft size={18} strokeWidth={2} />
      </Link>
      <h1 className={styles.title}>Goals</h1>
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
