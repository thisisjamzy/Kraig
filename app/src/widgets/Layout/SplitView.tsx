'use client';

// Template B, the split planner: two or three panels side by side that
// each scroll on their own, filling the height under the top bar (so an
// iPad in landscape, ~768px tall, never needs a page scroll). Widths are
// fixed pixels or 'flex'.

import type { ReactNode } from 'react';
import styles from './SplitView.module.css';

export interface SplitPanel {
  key: string;
  width: number | 'flex';
  /** Accessible name for the region. */
  label: string;
  content: ReactNode;
}

export function SplitView({ panels, className }: { panels: SplitPanel[]; className?: string }) {
  const columns = panels.map((p) => (p.width === 'flex' ? 'minmax(0, 1fr)' : `${p.width}px`)).join(' ');
  return (
    <div className={`${styles.split} ${className ?? ''}`} style={{ gridTemplateColumns: columns }}>
      {panels.map((p) => (
        <section key={p.key} className={styles.panel} aria-label={p.label}>
          {p.content}
        </section>
      ))}
    </div>
  );
}
