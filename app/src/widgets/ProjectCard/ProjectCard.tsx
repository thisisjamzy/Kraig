'use client';

// The one project card every project listing uses — Area Detail, Bucket
// Detail, and the Projects tab of the Projects hub. Keeping a single
// component means a future visual change to "the project card" only ever
// needs to happen here.

import { ChevronRight, Target } from 'lucide-react';
import type { ProjectStatus, Priority } from '@/src/shared/firestore/types';
import styles from './ProjectCard.module.css';

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export interface ProjectCardData {
  id: string;
  name: string;
  emoji: string | null;
  // The project's own PROJECT_COLORS pick (viewmodels/projects.ts) — the
  // card's whole background now runs off this single value (see
  // Design/task1.jpg, task2.jpg's vivid gradient task/project cards),
  // rather than the plain bordered-white card this used to be.
  color: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: Date | null;
  endDate: Date | null;
  taskCount: number;
  completionPercent: number;
  // Only the Projects hub's own list computes this (src/logic/projects/
  // useLogic.ts) — every other listing simply omits it.
  atRisk?: boolean;
}

export function ProjectCard({ project, onClick }: { project: ProjectCardData; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      style={{ background: `linear-gradient(135deg, ${project.color}, color-mix(in srgb, ${project.color} 55%, #000000))` }}
    >
      <div className={styles.top}>
        <span className={styles.emoji}>{project.emoji ?? '📁'}</span>
        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} />
      </div>
      <p className={styles.name}>{project.name}</p>
      <p className={styles.timeline}>
        {project.startDate ? formatDate(project.startDate) : '—'}
        {' - '}
        {project.endDate ? formatDate(project.endDate) : '—'}
      </p>
      <div className={styles.progressRow}>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${project.completionPercent}%` }} />
        </div>
        <span className={styles.progressValue}>{project.completionPercent}%</span>
      </div>
      <div className={styles.badgeRow}>
        <span className={styles.statusChip}>{project.status}</span>
        <span className={styles.priorityChip}>{project.priority}</span>
        <span className={styles.taskCountChip}>{project.taskCount} tasks</span>
        {project.atRisk && (
          <span className={styles.riskChip}>
            <Target size={11} strokeWidth={2.25} /> At risk
          </span>
        )}
      </div>
    </button>
  );
}
