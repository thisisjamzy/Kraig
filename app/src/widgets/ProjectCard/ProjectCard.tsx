'use client';

// The one project card every project listing uses — Area Detail and
// Bucket Detail. Keeping a single component means a future visual change
// to "the project card" only ever needs to happen here.

import { Target } from 'lucide-react';
import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import type { ProjectStatus, Priority } from '@/src/shared/firestore/types';
import styles from './ProjectCard.module.css';

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

const CIRCLE_SIZE = 40;
const CIRCLE_STROKE = 4;
const CIRCLE_RADIUS = (CIRCLE_SIZE - CIRCLE_STROKE) / 2;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

function CircularProgress({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = CIRCLE_CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div className={styles.circularProgress}>
      <svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}>
        <circle
          cx={CIRCLE_SIZE / 2}
          cy={CIRCLE_SIZE / 2}
          r={CIRCLE_RADIUS}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={CIRCLE_STROKE}
        />
        <circle
          cx={CIRCLE_SIZE / 2}
          cy={CIRCLE_SIZE / 2}
          r={CIRCLE_RADIUS}
          fill="none"
          stroke="var(--ink-bg)"
          strokeWidth={CIRCLE_STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCLE_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
        />
      </svg>
      <span className={styles.circularProgressLabel}>{clamped}%</span>
    </div>
  );
}

export interface ProjectCardData {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  areaName: string | null;
  bucketName: string | null;
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
    <button type="button" className={styles.card} onClick={onClick}>
      <div
        className={styles.cover}
        style={{ backgroundImage: `url(${projectCoverImageUrl(project.id)})` }}
        role="img"
        aria-label=""
      />
      <div className={styles.body}>
        <p className={styles.name}>{project.name}</p>
        {project.areaName && <p className={styles.areaName}>{project.areaName}</p>}
        {project.bucketName && <p className={styles.bucketName}>{project.bucketName}</p>}

        <div className={styles.timelineRow}>
          <p className={styles.timeline}>
            {project.startDate ? formatDate(project.startDate) : '—'}
            {' - '}
            {project.endDate ? formatDate(project.endDate) : '—'}
          </p>
          <CircularProgress percent={project.completionPercent} />
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

        {project.description && <p className={styles.description}>{project.description}</p>}
      </div>
    </button>
  );
}
