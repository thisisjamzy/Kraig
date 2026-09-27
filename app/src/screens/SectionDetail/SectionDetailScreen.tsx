'use client';

import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/sectionDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import styles from './SectionDetailScreen.module.css';

export function SectionDetailScreen({ bucketId }: { bucketId: string }) {
  const { section, area, projects, goBack, openProject, openEdit, openNewProject, loading, error } =
    useLogic(bucketId);

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Section"
        right={
          section && (
            <button type="button" className={styles.editButton} onClick={openEdit} aria-label="Edit section">
              <Pencil size={14} strokeWidth={1.75} />
            </button>
          )
        }
      />

      {section && (
        <>
          <div
            className={styles.cover}
            style={{ backgroundImage: `url(${projectCoverImageUrl(section.id)})` }}
            role="img"
            aria-label=""
          />
          <p className={styles.bucketName}>{section.name}</p>
          {area && <span className={styles.areaChip}>{area.name}</span>}
          {section.description && <p className={styles.descriptionText}>{section.description}</p>}
        </>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && section && (
        <>
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
            <p className={styles.emptyText}>No projects in this section yet.</p>
          ) : (
            <div className={styles.projectCarousel} data-hscroll="true">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => openProject(project.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
