'use client';

import { Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/projects/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { BucketCard } from '@/src/widgets/BucketCard/BucketCard';
import styles from './ProjectsScreen.module.css';

export function ProjectsScreen() {
  const strings = useStrings();
  const {
    tab,
    setTab,
    overview,
    areas,
    buckets,
    projects,
    archivedAreas,
    archivedProjects,

    restoreArea,
    restoreProject,
    openProject,
    openArea,
    openBucket,
    openCreateProject,
    openCreateArea,
    openTaskList,

    loading,
    error,
  } = useLogic();

  const swipeRef = useSwipeModeSwitch('projects');

  return (
    <div className={styles.page} ref={swipeRef}>
      <div className={styles.topRow}>
        <h1 className={styles.portfolioTitle}>{strings.projects.taskBasketTitle}</h1>
        <button type="button" className={styles.viewAllButton} onClick={() => openTaskList('all')}>
          {strings.projects.viewAllTasksLabel}
        </button>
      </div>

      <div className={styles.tileGrid}>
        <button type="button" className={`${styles.tile} ${styles.tilePurple}`} onClick={() => openTaskList('today')}>
          <span className={styles.tileLabel}>{strings.projects.overviewToday}</span>
          <p className={styles.tileValue}>{overview.todayCount}</p>
        </button>
        <button type="button" className={`${styles.tile} ${styles.tileOrange}`} onClick={() => openTaskList('week')}>
          <span className={styles.tileLabel}>{strings.projects.overviewThisWeek}</span>
          <p className={styles.tileValue}>{overview.scheduleThisWeekCount}</p>
        </button>
        <button type="button" className={`${styles.tile} ${styles.tileBlue}`} onClick={() => openTaskList('overdue')}>
          <span className={styles.tileLabel}>{strings.projects.overviewOverdue}</span>
          <p className={styles.tileValue}>{overview.overdueTaskCount}</p>
        </button>
        <button type="button" className={`${styles.tile} ${styles.tileGreen}`} onClick={() => openTaskList('all')}>
          <span className={styles.tileLabel}>{strings.projects.overviewAllTasks}</span>
          <p className={styles.tileValue}>{overview.pendingTaskCount}</p>
        </button>
      </div>

      <h2 className={styles.portfolioTitle}>Portfolio</h2>

      <div className={styles.periodTabs}>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'areas' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('areas')}
        >
          {strings.projects.tabAreas}
        </button>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'buckets' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('buckets')}
        >
          {strings.projects.tabBuckets}
        </button>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'projects' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('projects')}
        >
          {strings.projects.tabProjects}
        </button>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'archive' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('archive')}
        >
          {strings.projects.tabArchive}
        </button>
      </div>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && tab === 'areas' && (
        <>
          {areas.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyAreas}</p>
          ) : (
            <div className={styles.areaGrid}>
              {areas.map((area) => (
                <button key={area.id} type="button" className={styles.areaCard} onClick={() => openArea(area.id)}>
                  <span className={styles.areaCardEmoji}>{area.emoji ?? '📁'}</span>
                  <p className={styles.areaCardName}>{area.name}</p>
                  <p className={styles.areaCardMeta}>
                    {area.projectCount} {strings.projects.projectCountSuffix}
                  </p>
                </button>
              ))}
            </div>
          )}
          <button type="button" className={styles.addButton} onClick={openCreateArea}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.projects.newArea}
          </button>
        </>
      )}

      {!loading && !error && tab === 'buckets' && (
        <>
          {buckets.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyBuckets}</p>
          ) : (
            <div className={styles.bucketGrid}>
              {buckets.map((bucket) => (
                <BucketCard key={bucket.id} bucket={bucket} onClick={() => openBucket(bucket.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !error && tab === 'projects' && (
        <>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyProjects}</p>
          ) : (
            <div className={styles.projectGrid}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => openProject(project.id)} />
              ))}
            </div>
          )}
          <button type="button" className={styles.addButton} onClick={openCreateProject}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.projects.newProject}
          </button>
        </>
      )}

      {!loading && !error && tab === 'archive' && (
        <>
          {archivedAreas.length === 0 && archivedProjects.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyArchive}</p>
          ) : (
            <>
              {archivedAreas.length > 0 && (
                <>
                  <p className={styles.sectionTitle}>{strings.projects.archivedAreasTitle}</p>
                  <div className={styles.list}>
                    {archivedAreas.map((area) => (
                      <div key={area.id} className={styles.archiveRow}>
                        <span className={styles.archiveRowName}>{area.name}</span>
                        <button type="button" className={styles.restoreButton} onClick={() => restoreArea(area.id)}>
                          {strings.projects.restoreAction}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {archivedProjects.length > 0 && (
                <>
                  <p className={styles.sectionTitle}>{strings.projects.archivedProjectsTitle}</p>
                  <div className={styles.list}>
                    {archivedProjects.map((project) => (
                      <div key={project.id} className={styles.archiveRow}>
                        <span className={styles.archiveRowName}>{project.name}</span>
                        <button
                          type="button"
                          className={styles.restoreButton}
                          onClick={() => restoreProject(project.id)}
                        >
                          {strings.projects.restoreAction}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
