'use client';

import Link from 'next/link';
import { ChevronLeft, Pencil, ChevronRight, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/areaDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './AreaDetailScreen.module.css';

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  const { area, projects, goBack, openProject, openEdit, loading, error } = useLogic(areaId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Area</h1>
        {area && (
          <button type="button" className={styles.archiveButton} onClick={openEdit} aria-label="Edit area">
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        )}
      </header>

      {area && (
        <>
          <p className={styles.areaName}>
            <span className={styles.emoji}>{area.emoji ?? '📁'}</span>
            {area.name}
          </p>
          {area.description && <p className={styles.descriptionText}>{area.description}</p>}
        </>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && area && (
        <>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Projects</h2>
          </div>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>No projects in this area yet.</p>
          ) : (
            <div className={styles.list}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={styles.projectCard}
                  onClick={() => openProject(project.id)}
                >
                  <div className={styles.projectCardTop}>
                    <span className={styles.emojiSmall}>{project.emoji ?? '📁'}</span>
                    <p className={styles.projectCardName}>{project.name}</p>
                    <ChevronRight size={16} strokeWidth={2} />
                  </div>
                  <p className={styles.projectCardTimeline}>
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
                  <div className={styles.projectCardBadgeRow}>
                    <span className={styles.statusChip}>{project.status}</span>
                    <span className={styles.priorityChip}>{project.priority}</span>
                    <span className={styles.taskCountChip}>{project.taskCount} tasks</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <Link href={`/projects/new?areaId=${areaId}`} className={styles.addLinkButton}>
            <Plus size={16} strokeWidth={2.25} />
            New project in this area
          </Link>
        </>
      )}
    </div>
  );
}
