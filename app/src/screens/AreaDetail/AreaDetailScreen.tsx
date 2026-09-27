'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/areaDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { SectionCard } from '@/src/widgets/SectionCard/SectionCard';
import { TaskCheckRow } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import styles from './AreaDetailScreen.module.css';

export function AreaDetailScreen({ areaId }: { areaId: string }) {
  const {
    area,
    projects,
    tasks,
    sections,
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
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={area?.name ?? 'Area'}
        right={
          area && (
            <button type="button" className={styles.archiveButton} onClick={openEdit} aria-label="Edit area">
              <Pencil size={14} strokeWidth={1.75} />
            </button>
          )
        }
      />

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
            <h2 className={styles.sectionTitle}>Sections</h2>
            <button
              type="button"
              className={styles.addIconButton}
              onClick={openNewBucket}
              aria-label="New section"
              title="New section"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
          {sections.length === 0 ? (
            <p className={styles.emptyText}>No sections yet.</p>
          ) : (
            <div className={styles.bucketCarousel} data-hscroll="true">
              {sections.map((section) => (
                <SectionCard key={section.id} section={section} onClick={() => openBucket(section.id)} />
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
                <ProjectCard key={project.id} project={project} variant="compact" onClick={() => openProject(project.id)} />
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
                <TaskCheckRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
