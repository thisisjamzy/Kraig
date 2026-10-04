'use client';

// Template A, the dashboard grid (medium screens and up): 12 columns, 24px
// gaps (16px on medium). Cards declare a size and are placed in reading
// order — no dense packing, so nothing gets reordered.
//   S 3 · M 4 · L 6 · XL 8 · Full 12   (medium: S 6, M/L 6 or 12, XL/Full 12)
// Each GridCard is a container (container-type: inline-size), so the card
// inside can adapt to its own width with @container queries.

import type { CSSProperties, ReactNode } from 'react';
import styles from '@/src/phone/widgets/Layout/PageGrid.module.css';

export type CardSize = 'S' | 'M' | 'L' | 'XL' | 'Full';

export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${styles.grid} ${className ?? ''}`}>{children}</div>;
}

export function GridCard({
  size,
  wideOnMedium = false,
  equalHeight = false,
  children,
  className,
  style,
}: {
  size: CardSize;
  /** Medium: take the full 12 columns instead of 6 (M and L only). */
  wideOnMedium?: boolean;
  /** Stretch to the row's height (KPI rows). */
  equalHeight?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${styles.cell} ${className ?? ''}`}
      data-size={size}
      data-medium-wide={wideOnMedium || undefined}
      data-equal={equalHeight || undefined}
      style={style}
    >
      {children}
    </div>
  );
}
