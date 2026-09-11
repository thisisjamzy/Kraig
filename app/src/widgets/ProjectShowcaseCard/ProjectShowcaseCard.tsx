'use client';

// The Projects hub's own home-screen carousel card (Design/task5.JPG's
// "Welcome, Salung" frame) — a cover-photo project card distinct from the
// grid ProjectCard (src/widgets/ProjectCard) used in Area/Bucket Detail and
// the Portfolio tab's own Projects list. Kept as its own component rather
// than a variant of ProjectCard since the two show different fields
// entirely (a cover image + description here, a status/priority/task-count
// badge row there) for a different context (a horizontally scrolling
// highlight reel vs. a full browsable grid).

import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import styles from './ProjectShowcaseCard.module.css';

export interface ProjectShowcaseCardData {
  id: string;
  name: string;
  bucketName: string | null;
  description: string;
  completionPercent: number;
}

export function ProjectShowcaseCard({ project, onClick }: { project: ProjectShowcaseCardData; onClick: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div
        className={styles.cover}
        style={{ backgroundImage: `url(${projectCoverImageUrl(project.id)})` }}
        role="img"
        aria-label=""
      />
      <div className={styles.body}>
        <p className={styles.name}>{project.name}</p>
        {project.bucketName && <p className={styles.bucketName}>{project.bucketName}</p>}
        {project.description && <p className={styles.description}>{project.description}</p>}
        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${project.completionPercent}%` }} />
          </div>
          <span className={styles.progressValue}>{project.completionPercent}%</span>
        </div>
      </div>
    </button>
  );
}
