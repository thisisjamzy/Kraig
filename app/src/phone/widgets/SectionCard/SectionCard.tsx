'use client';

// The one section card every section listing uses — Area Detail's own
// Sections section and the Projects hub's Portfolio > Sections tab. Same
// idea as ProjectCard (src/widgets/ProjectCard): one place to change "the
// section card" everywhere it appears.

import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import styles from '@/src/phone/widgets/SectionCard/SectionCard.module.css';

export interface SectionCardData {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  projectCount: number;
  // Only the Portfolio's cross-area Sections tab passes this — Area Detail's
  // own list is already scoped to one area, so naming it there would be
  // redundant.
  areaName?: string | null;
}

export function SectionCard({ section, onClick }: { section: SectionCardData; onClick: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div
        className={styles.cover}
        style={{ backgroundImage: `url(${projectCoverImageUrl(section.id)})` }}
        role="img"
        aria-label=""
      />
      <div className={styles.body}>
        <p className={styles.name}>{section.name}</p>
        <span className={styles.countChip}>{section.projectCount} projects</span>
        {section.areaName && <span className={styles.areaChip}>{section.areaName}</span>}
        {section.description && <p className={styles.description}>{section.description}</p>}
      </div>
    </button>
  );
}
