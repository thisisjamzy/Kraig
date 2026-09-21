'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ArrowUpRight } from 'lucide-react';
import { useLogic } from '@/src/logic/projects/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { Modal } from '@/src/widgets/Modal/Modal';
import { projectCoverImageUrl } from '@/src/viewmodels/projects';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './ProjectsScreen.module.css';
import webStyles from './ProjectsScreen.web.module.css';

export function ProjectsScreen() {
  const strings = useStrings();
  const {
    performance,
    todayPriorityTasks,
    pendingTasksForPicker,
    priorityPickerOpen,
    setPriorityPickerOpen,
    toggleTodayPriority,
    areas,
    projects,

    openProject,
    openArea,
    openTaskList,

    loading,
    error,
  } = useLogic();

  const swipeRef = useSwipeModeSwitch('projects');
  const router = useRouter();
  const isWeb = useIsWeb();
  const [projectSort, setProjectSort] = useState<'timeline' | 'name'>('timeline');
  const activeProjects = projects
    .filter((project) => project.status === 'Active')
    .sort((a, b) =>
      projectSort === 'name'
        ? a.name.localeCompare(b.name)
        : (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity)
    );

  return (
    <div className={`${styles.page} ${isWeb ? webStyles.page : ''}`} ref={swipeRef}>
      <h1 className={styles.greeting}>{strings.projects.heroTagline}</h1>

      <div className={styles.performanceCard}>
        <div className={styles.performanceLeft}>
          <p className={styles.performanceTitle}>{strings.projects.performanceTitle}</p>
          <button type="button" className={styles.performanceButton} onClick={() => router.push('/projects/analytics')}>
            {strings.projects.performanceCheckNow}
          </button>
        </div>
        <div className={styles.performanceHeatmapWrap}>
          <div className={styles.performanceHeatmap}>
            {performance.cells.map((cell, index) => (
              <span
                key={index}
                className={styles.heatmapCell}
                data-level={cell.level}
                title={cell.count > 0 ? `${cell.count} completed` : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <ScreenState loading={loading} error={error} />

      <div className={styles.topRow}>
        <h2 className={styles.portfolioTitle}>{strings.projects.todaysTasksTitle}</h2>
        <div className={styles.topRowActions}>
          <button type="button" className={styles.pillButtonWhite} onClick={() => setPriorityPickerOpen(true)}>
            {todayPriorityTasks.length > 0 ? strings.projects.editPriorities : strings.projects.setPriorities}
          </button>
          <button type="button" className={styles.pillButtonBlack} onClick={() => openTaskList('today')}>
            {strings.projects.seeAll}
          </button>
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
      </div>

      {todayPriorityTasks.length === 0 ? (
        <p className={styles.emptyText}>{strings.projects.todayPrioritiesEmpty}</p>
      ) : (
        <>
          {todayPriorityTasks.length < 3 && (
            <p className={styles.priorityHint}>{strings.projects.todayPrioritiesHint}</p>
          )}
          <div className={`${styles.priorityList} ${isWeb ? webStyles.priorityList : ''}`}>
            {todayPriorityTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </>
      )}

      <div className={styles.topRow}>
        <h2 className={styles.portfolioTitle}>{strings.projects.tabAreas}</h2>
        <Link href="/areas" className={styles.viewAllButton} aria-label="See all areas" title="See all areas">
          <ArrowUpRight size={16} strokeWidth={2.25} />
        </Link>
      </div>

      {!loading && !error && (
        <>
          {areas.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyAreas}</p>
          ) : (
            <div className={`${styles.areaCarousel} ${isWeb ? webStyles.areaCarousel : ''}`} data-hscroll="true">
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  className={`${styles.areaCard} ${isWeb ? webStyles.areaCard : ''}`}
                  onClick={() => openArea(area.id)}
                >
                  <div
                    className={styles.areaCardCover}
                    style={{ backgroundImage: `url(${projectCoverImageUrl(area.id)})` }}
                    role="img"
                    aria-label=""
                  />
                  <div className={styles.areaCardBody}>
                    <p className={styles.areaCardName}>{area.name}</p>
                    <p className={styles.areaCardMeta}>
                      {area.projectCount} {strings.projects.projectCountSuffix}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className={styles.topRow}>
        <h2 className={styles.portfolioTitle}>{strings.projects.projectsSectionTitle}</h2>
        <div className={styles.topRowActions}>
          <div className={styles.sortToggle}>
            <button
              type="button"
              className={`${styles.sortToggleButton} ${projectSort === 'timeline' ? styles.sortToggleButtonActive : ''}`}
              onClick={() => setProjectSort('timeline')}
            >
              Timeline
            </button>
            <button
              type="button"
              className={`${styles.sortToggleButton} ${projectSort === 'name' ? styles.sortToggleButtonActive : ''}`}
              onClick={() => setProjectSort('name')}
            >
              Name
            </button>
          </div>
          <Link href="/projects/all" className={styles.viewAllButton} aria-label="See all projects" title="See all projects">
            <ArrowUpRight size={16} strokeWidth={2.25} />
          </Link>
        </div>
      </div>

      {activeProjects.length === 0 ? (
        <p className={styles.emptyText}>{strings.projects.emptyProjectsCarousel}</p>
      ) : (
        <div className={`${styles.projectCarousel} ${isWeb ? webStyles.projectCarousel : ''}`} data-hscroll="true">
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => openProject(project.id)}
              className={isWeb ? webStyles.projectCardWeb : undefined}
            />
          ))}
        </div>
      )}

      {priorityPickerOpen && (
        <Modal title={strings.projects.priorityPickerTitle} onClose={() => setPriorityPickerOpen(false)}>
          <p className={styles.priorityHint}>{strings.projects.priorityPickerHint}</p>
          {pendingTasksForPicker.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.priorityPickerEmpty}</p>
          ) : (
            <div className={styles.pickerList}>
              {pendingTasksForPicker.map((task) => (
                <label key={task.id} className={styles.pickerRow}>
                  <input
                    type="checkbox"
                    className={styles.pickerCheckbox}
                    checked={task.isTodayPriority}
                    onChange={() => toggleTodayPriority(task.id)}
                  />
                  <span className={styles.pickerRowText}>
                    <span className={styles.pickerRowTitle}>{task.title}</span>
                    <span className={styles.pickerRowMeta}>
                      {task.priority}
                      {task.dueDate
                        ? ` • ${task.dueDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`
                        : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <button type="button" className={styles.modalSaveButton} onClick={() => setPriorityPickerOpen(false)}>
            {strings.projects.priorityPickerDone}
          </button>
        </Modal>
      )}
    </div>
  );
}
