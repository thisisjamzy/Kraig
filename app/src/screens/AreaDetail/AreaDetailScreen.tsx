'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/areaDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { BucketCard } from '@/src/widgets/BucketCard/BucketCard';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import styles from './AreaDetailScreen.module.css';

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  const {
    area,
    projects,
    tasks,
    buckets,
    goBack,
    openProject,
    openEdit,
    openBucket,
    openNewBucket,
    openNewProject,
    loading,
    error,
  } = useLogic(areaId);
  const router = useRouter();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{area?.name ?? 'Area'}</h1>
        {area && (
          <button type="button" className={styles.archiveButton} onClick={openEdit} aria-label="Edit area">
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        )}
      </header>

      {area && (
        <div
          className={styles.cover}
          style={{ backgroundImage: `url(${projectCoverImageUrl(area.id)})` }}
          role="img"
          aria-label=""
        />
      )}

      {area?.description && <p className={styles.descriptionText}>{area.description}</p>}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && area && (
        <>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Buckets</h2>
            <button
              type="button"
              className={styles.addIconButton}
              onClick={openNewBucket}
              aria-label="New bucket"
              title="New bucket"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
          {buckets.length === 0 ? (
            <p className={styles.emptyText}>No buckets yet.</p>
          ) : (
            <div className={styles.bucketCarousel} data-hscroll="true">
              {buckets.map((bucket) => (
                <BucketCard key={bucket.id} bucket={bucket} onClick={() => openBucket(bucket.id)} />
              ))}
            </div>
          )}

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Projects</h2>
            <button
              type="button"
              className={styles.addIconButton}
              onClick={openNewProject}
              aria-label="New project"
              title="New project"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>No projects in this area yet.</p>
          ) : (
            <div className={styles.projectCarousel} data-hscroll="true">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => openProject(project.id)} />
              ))}
            </div>
          )}

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Tasks</h2>
            <button
              type="button"
              className={styles.addIconButton}
              onClick={() => router.push('/tasks/new')}
              aria-label="New task"
              title="New task"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className={styles.emptyText}>No tasks in this area yet.</p>
          ) : (
            <div className={styles.taskList}>
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
