'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogic } from '@/src/logic/projects/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectShowcaseCard } from '@/src/widgets/ProjectShowcaseCard/ProjectShowcaseCard';
import { TaskCard } from '@/src/widgets/TaskCard/TaskCard';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './ProjectsScreen.module.css';

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
  const [projectSort, setProjectSort] = useState<'timeline' | 'name'>('timeline');
  const activeProjects = projects
    .filter((project) => project.status === 'Active')
    .sort((a, b) =>
      projectSort === 'name'
        ? a.name.localeCompare(b.name)
        : (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity)
    );

  return (
    <div className={styles.page} ref={swipeRef}>
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
        </div>
      </div>

      {todayPriorityTasks.length === 0 ? (
        <p className={styles.emptyText}>{strings.projects.todayPrioritiesEmpty}</p>
      ) : (
        <>
          {todayPriorityTasks.length < 3 && (
            <p className={styles.priorityHint}>{strings.projects.todayPrioritiesHint}</p>
          )}
          <div className={styles.priorityList}>
            {todayPriorityTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </>
      )}

      <h2 className={styles.portfolioTitle}>{strings.projects.tabAreas}</h2>

      {!loading && !error && (
        <>
          {areas.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyAreas}</p>
          ) : (
            <div className={styles.areaGrid}>
              {areas.map((area) => (
                <div key={area.id} className={styles.areaCard}>
                  <button type="button" className={styles.areaCardMain} onClick={() => openArea(area.id)}>
                    <span className={styles.areaCardEmoji}>{area.emoji ?? '📁'}</span>
                    <p className={styles.areaCardName}>{area.name}</p>
                    <p className={styles.areaCardMeta}>
                      {area.projectCount} {strings.projects.projectCountSuffix}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className={styles.topRow}>
        <h2 className={styles.portfolioTitle}>{strings.projects.projectsSectionTitle}</h2>
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
      </div>

      {activeProjects.length === 0 ? (
        <p className={styles.emptyText}>{strings.projects.emptyProjectsCarousel}</p>
      ) : (
        <div className={styles.projectCarousel} data-hscroll="true">
          {activeProjects.map((project) => (
            <ProjectShowcaseCard
              key={project.id}
              project={project}
              onClick={() => openProject(project.id)}
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
