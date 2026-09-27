'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ArrowUpRight, ListChecks } from 'lucide-react';
import { useLogic } from '@/src/logic/projects/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ProjectCard } from '@/src/widgets/ProjectCard/ProjectCard';
import { TaskCheckRow } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import { DailyProgressCard } from '@/src/widgets/DailyProgressCard/DailyProgressCard';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import { priorityLabel } from '@/src/viewmodels/projects';
import styles from './ProjectsScreen.module.css';
import webStyles from './ProjectsScreen.web.module.css';

// The Time hub: active projects as a horizontal strip, then today's tasks
// as a checklist. Nothing else — areas and performance analytics live on
// their own screens (/areas, /projects/analytics).
export function ProjectsScreen() {
  const strings = useStrings();
  const {
    todayTasks,
    todayDoneCount,
    pendingTasksForPicker,
    priorityPickerOpen,
    setPriorityPickerOpen,
    toggleTodayPriority,
    projects,
    openProject,
    openTaskList,
    loading,
    error,
  } = useLogic();

  const swipeRef = useSwipeModeSwitch('projects');
  const router = useRouter();
  const isWeb = useIsWeb();
  // Soonest-starting first — the order the old Timeline sort defaulted to.
  const activeProjects = projects
    .filter((project) => project.status === 'Active')
    .sort((a, b) => (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity));
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={`${styles.page} ${isWeb ? webStyles.page : ''}`} ref={swipeRef}>
      <ScreenState loading={loading} error={error} />

      <section className={styles.hubSection}>
        <div className={styles.hubHeader}>
          <h2 className={styles.hubTitle}>{strings.projects.projectsSectionTitle}</h2>
          <Link
            href="/projects/all"
            className={styles.viewAllButton}
            aria-label={strings.projects.seeAllProjects}
            title={strings.projects.seeAllProjects}
          >
            <ArrowUpRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {!loading && activeProjects.length === 0 ? (
          <p className={styles.emptyText}>{strings.projects.emptyProjectsCarousel}</p>
        ) : (
          <div className={styles.projectStrip} data-hscroll="true">
            {activeProjects.map((project) => (
              <ProjectCard key={project.id} project={project} variant="compact" onClick={() => openProject(project.id)} />
            ))}
          </div>
        )}
      </section>

      {!loading && <DailyProgressCard done={todayDoneCount} total={todayTasks.length} />}

      <section className={styles.hubSection}>
        <div className={styles.hubHeader}>
          <div className={styles.hubHeading}>
            <h2 className={styles.hubTitle}>{strings.projects.todaysTasksTitle}</h2>
            <p className={styles.hubSubtitle}>{todayLabel}</p>
          </div>
          <div className={styles.hubActions}>
            <button
              type="button"
              className={styles.iconButtonSoft}
              onClick={() => setPriorityPickerOpen(true)}
              aria-label={strings.projects.planToday}
              title={strings.projects.planToday}
            >
              <ListChecks size={16} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className={styles.iconButtonSoft}
              onClick={() => router.push('/tasks/new')}
              aria-label={strings.projects.addTask}
              title={strings.projects.addTask}
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className={styles.viewAllButton}
              onClick={() => openTaskList('today')}
              aria-label={strings.projects.seeAllTasks}
              title={strings.projects.seeAllTasks}
            >
              <ArrowUpRight size={16} strokeWidth={2.25} />
            </button>
          </div>
        </div>


        {!loading && todayTasks.length === 0 ? (
          <div className={styles.todayEmpty}>
            <p className={styles.todayEmptyTitle}>{strings.projects.todayEmpty}</p>
            <p className={styles.emptyText}>{strings.projects.todayEmptyHint}</p>
          </div>
        ) : (
          <div className={`${styles.taskList} ${isWeb ? webStyles.taskList : ''}`}>
            {todayTasks.map((task) => (
              <TaskCheckRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>

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
                      {priorityLabel(task.priority)}
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
