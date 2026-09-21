'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/allProjects/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { SwipeableListItem } from '@/src/widgets/SwipeableListItem/SwipeableListItem';
import styles from './AllProjectsScreen.module.css';

// Same short date format ProjectCard's own formatDate uses
// (src/widgets/ProjectCard/ProjectCard.tsx) — kept local since that one
// isn't exported, and this list's row isn't that fixed-width carousel
// card (just the same info, laid out full-width).
function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AllProjectsScreen() {
  const strings = useStrings();
  const { projects, sort, setSort, archiveProject, goBack, loading, error } = useLogic();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingProject = projects.find((project) => project.id === pendingDeleteId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.projects.projectsSectionTitle}</h1>
      </header>

      <div className={styles.topRow}>
        <div className={styles.sortToggle}>
          <button
            type="button"
            className={`${styles.sortToggleButton} ${sort === 'timeline' ? styles.sortToggleButtonActive : ''}`}
            onClick={() => setSort('timeline')}
          >
            Timeline
          </button>
          <button
            type="button"
            className={`${styles.sortToggleButton} ${sort === 'name' ? styles.sortToggleButtonActive : ''}`}
            onClick={() => setSort('name')}
          >
            Name
          </button>
        </div>
      </div>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyProjectsCarousel}</p>
          ) : (
            <div className={styles.list}>
              {projects.map((project) => (
                <SwipeableListItem
                  key={project.id}
                  className={styles.listItem}
                  deleteLabel={`Delete ${project.name}`}
                  onDelete={() => setPendingDeleteId(project.id)}
                >
                  <Link href={`/projects/${project.id}`} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={styles.dot} style={{ background: project.color }} />
                      <span className={styles.name}>
                        {project.emoji ? `${project.emoji} ` : ''}
                        {project.name}
                      </span>
                    </div>

                    <p className={styles.timeline}>
                      {project.startDate ? formatDate(project.startDate) : '—'}
                      {' - '}
                      {project.endDate ? formatDate(project.endDate) : '—'}
                    </p>

                    {project.description && <p className={styles.description}>{project.description}</p>}

                    {(project.areaName || project.bucketName) && (
                      <div className={styles.metaRow}>
                        {project.areaName && <span className={styles.metaChip}>{project.areaName}</span>}
                        {project.bucketName && <span className={styles.metaChip}>{project.bucketName}</span>}
                      </div>
                    )}
                  </Link>
                </SwipeableListItem>
              ))}
            </div>
          )}
        </>
      )}

      {pendingProject && (
        <ConfirmDialog
          title={strings.projects.archiveProjectConfirmTitle}
          message={strings.projects.archiveProjectConfirmMessage}
          confirmLabel={strings.common.delete}
          cancelLabel={strings.common.cancel}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            archiveProject(pendingProject.id);
            setPendingDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
