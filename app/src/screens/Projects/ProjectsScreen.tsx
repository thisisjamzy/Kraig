'use client';

import { Plus, Target } from 'lucide-react';
import { useLogic } from '@/src/logic/projects/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './ProjectsScreen.module.css';

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

export function ProjectsScreen() {
  const strings = useStrings();
  const {
    tab,
    setTab,
    overview,
    areas,
    projects,
    archivedAreas,
    archivedProjects,

    restoreArea,
    restoreProject,
    openProject,
    openArea,
    openCreateProject,
    openCreateArea,

    loading,
    error,
  } = useLogic();

  const swipeRef = useSwipeModeSwitch('projects');
  const archiveCount = archivedAreas.length + archivedProjects.length;

  return (
    <div className={styles.page} ref={swipeRef}>
      <div className={styles.tileGrid}>
        <div className={`${styles.tile} ${styles.tilePurple}`}>
          <span className={styles.tileLabel}>{strings.projects.overviewToday}</span>
          <p className={styles.tileValue}>{overview.todayCount}</p>
        </div>
        <div className={`${styles.tile} ${styles.tileOrange}`}>
          <span className={styles.tileLabel}>{strings.projects.overviewThisWeek}</span>
          <p className={styles.tileValue}>{overview.scheduleThisWeekCount}</p>
        </div>
        <div className={`${styles.tile} ${styles.tileBlue}`}>
          <span className={styles.tileLabel}>{strings.projects.overviewProjects}</span>
          <p className={styles.tileValue}>{overview.atRiskProjectCount}</p>
        </div>
        <div className={`${styles.tile} ${styles.tileGreen}`}>
          <span className={styles.tileLabel}>{strings.projects.overviewAllTasks}</span>
          <p className={styles.tileValue}>{overview.pendingTaskCount}</p>
        </div>
      </div>

      <h2 className={styles.portfolioTitle}>Portfolio</h2>

      <div className={styles.periodTabs}>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'areas' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('areas')}
        >
          {strings.projects.tabAreas} ({areas.length})
        </button>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'projects' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('projects')}
        >
          {strings.projects.tabProjects} ({projects.length})
        </button>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'archive' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('archive')}
        >
          {strings.projects.tabArchive} ({archiveCount})
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

      {!loading && !error && tab === 'projects' && (
        <>
          {projects.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyProjects}</p>
          ) : (
            <div className={styles.projectList}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={styles.projectCard}
                  onClick={() => openProject(project.id)}
                >
                  <span className={styles.projectCardEmojiCircle} style={{ background: project.color }}>
                    {project.emoji ?? '📁'}
                  </span>
                  <div className={styles.projectCardBody}>
                    <p className={styles.cardName}>{project.name}</p>
                    <p className={styles.cardMeta}>
                      {project.startDate ? formatDate(project.startDate) : '—'} –{' '}
                      {project.endDate ? formatDate(project.endDate) : '—'}
                    </p>
                    <div className={styles.projectCardBadgeRow}>
                      <span className={styles.statusChip}>{project.status}</span>
                      <span className={styles.taskCountChip}>{project.taskCount} tasks</span>
                      {project.atRisk && (
                        <span className={styles.riskChip}>
                          <Target size={11} strokeWidth={2.25} /> At risk
                        </span>
                      )}
                    </div>
                  </div>
                </button>
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
