'use client';

import Link from 'next/link';
import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/bucketDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import styles from './BucketDetailScreen.module.css';

export function BucketDetailScreen({ bucketId }: { bucketId: string }) {
  const { bucket, area, projects, goBack, openProject, openEdit, loading, error } = useLogic(bucketId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Bucket</h1>
        {bucket && (
          <button type="button" className={styles.editButton} onClick={openEdit} aria-label="Edit bucket">
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        )}
      </header>

      {bucket && (
        <>
          <p className={styles.bucketName}>
            <span className={styles.emoji}>{bucket.emoji ?? '📦'}</span>
            {bucket.name}
          </p>
          {area && (
            <span className={styles.areaChip}>
              {area.emoji ? `${area.emoji} ` : ''}
              {area.name}
            </span>
          )}
          {bucket.description && <p className={styles.descriptionText}>{bucket.description}</p>}
        </>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && bucket && (
        <>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Projects</h2>
          </div>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>No projects in this bucket yet.</p>
          ) : (
            <div className={styles.projectGrid}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => openProject(project.id)} />
              ))}
            </div>
          )}
          <Link
            href={`/projects/new?areaId=${bucket.areaId}&bucketId=${bucketId}`}
            className={styles.addLinkButton}
          >
            <Plus size={16} strokeWidth={2.25} />
            New project in this bucket
          </Link>
        </>
      )}
    </div>
  );
}
