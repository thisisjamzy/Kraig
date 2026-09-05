'use client';

import Link from 'next/link';
import { ChevronLeft, Pencil, Plus, FolderPlus } from 'lucide-react';
import { useLogic } from '@/src/logic/areaDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { BucketCard } from '@/src/widgets/BucketCard/BucketCard';
import styles from './AreaDetailScreen.module.css';

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  const { area, projects, buckets, goBack, openProject, openEdit, openBucket, openNewBucket, loading, error } =
    useLogic(areaId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Area</h1>
        {area && (
          <>
            <button type="button" className={styles.archiveButton} onClick={openNewBucket} aria-label="Add bucket">
              <FolderPlus size={16} strokeWidth={1.75} />
            </button>
            <button type="button" className={styles.archiveButton} onClick={openEdit} aria-label="Edit area">
              <Pencil size={14} strokeWidth={1.75} />
            </button>
          </>
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
            <h2 className={styles.sectionTitle}>Buckets</h2>
          </div>
          {buckets.length === 0 ? (
            <p className={styles.emptyText}>No buckets yet.</p>
          ) : (
            <div className={styles.bucketGrid}>
              {buckets.map((bucket) => (
                <BucketCard key={bucket.id} bucket={bucket} onClick={() => openBucket(bucket.id)} />
              ))}
            </div>
          )}

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Projects</h2>
          </div>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>No projects in this area yet.</p>
          ) : (
            <div className={styles.projectGrid}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => openProject(project.id)} />
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
