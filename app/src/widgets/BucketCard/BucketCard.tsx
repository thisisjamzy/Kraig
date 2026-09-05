'use client';

// The one bucket card every bucket listing uses — Area Detail's own
// Buckets section and the Projects hub's Portfolio > Buckets tab. Same
// idea as ProjectCard (src/widgets/ProjectCard): one place to change "the
// bucket card" everywhere it appears.

import { ChevronRight } from 'lucide-react';
import styles from './BucketCard.module.css';

export interface BucketCardData {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  projectCount: number;
  // Only the Portfolio's cross-area Buckets tab passes this — Area Detail's
  // own list is already scoped to one area, so naming it there would be
  // redundant.
  areaName?: string | null;
}

export function BucketCard({ bucket, onClick }: { bucket: BucketCardData; onClick: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.top}>
        <span className={styles.colorDot} style={{ background: bucket.color }} />
        <span className={styles.emoji}>{bucket.emoji ?? '📦'}</span>
        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} />
      </div>
      <p className={styles.name}>{bucket.name}</p>
      {bucket.areaName && <span className={styles.areaChip}>{bucket.areaName}</span>}
      {bucket.description && <p className={styles.description}>{bucket.description}</p>}
      <span className={styles.countChip}>{bucket.projectCount} projects</span>
    </button>
  );
}
