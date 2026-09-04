'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronDown, Pencil, Plus } from 'lucide-react';
import { useLogic, type TaskFilterTab } from '@/src/logic/projectDetail/useLogic';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TaskQuickActionsMenu } from '@/src/widgets/TaskQuickActionsMenu/TaskQuickActionsMenu';
import { formatTaskDateRange } from '@/src/shared/formatTaskDateRange';
import { TASK_TYPE_LABEL } from '@/src/viewmodels/projects';
import type { ProjectStatus } from '@/src/shared/firestore/types';
import styles from './ProjectDetailScreen.module.css';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  Active: 'Ongoing',
  Completed: 'Completed',
  Archived: 'Archived',
};
const STATUSES: ProjectStatus[] = ['Active', 'Completed', 'Archived'];

const TASK_TABS: TaskFilterTab[] = ['all', 'done', 'pending', 'archived'];
const TASK_TAB_LABEL: Record<TaskFilterTab, string> = {
  all: 'All',
  done: 'Done',
  pending: 'Pending',
  archived: 'Archived',
};

const DESCRIPTION_PREVIEW_LENGTH = 160;

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const {
    project,
    area,
    areas,
    tasks,
    taskTab,
    setTaskTab,
    overdueCount,
    atRisk,
    rescheduleFlag,
    activitySegments,
    toggleTaskDone,
    updateStatus,
    updateAreaId,
    goBack,
    openEditProject,
    openAddTask,
    openTask,
    loading,
    error,
  } = useLogic(projectId);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);

  const description = project?.description ?? '';
  const descriptionIsLong = description.length > DESCRIPTION_PREVIEW_LENGTH;
  const descriptionShown =
    !descriptionIsLong || descriptionExpanded ? description : `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH)}…`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Project detail</h1>
        {project && (
          <button type="button" className={styles.archiveButton} onClick={openEditProject} aria-label="Edit project">
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        )}
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && project && (
        <>
          <p className={styles.projectName}>
            {project.emoji && <span className={styles.emoji}>{project.emoji}</span>}
            {project.name}
          </p>

          <div className={styles.badgeRow}>
            <button type="button" className={styles.statusPill} onClick={() => setStatusPickerOpen(true)}>
              {STATUS_LABEL[project.status]}
            </button>
            <button type="button" className={styles.areaChip} onClick={() => setAreaPickerOpen(true)}>
              {area ? `${area.emoji ? `${area.emoji} ` : ''}${area.name}` : 'No area'}
            </button>
            {atRisk && <span className={styles.riskBadge}>At risk · {overdueCount} overdue</span>}
            {rescheduleFlag.rescheduled && (
              <span className={styles.rescheduleBadge}>{rescheduleFlag.extended ? 'Extended' : 'Shortened'}</span>
            )}
          </div>

          {statusPickerOpen && (
            <Modal title="Change status" onClose={() => setStatusPickerOpen(false)}>
              <div className={styles.pickerOptions}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.pickerOption} ${project.status === s ? styles.pickerOptionActive : ''}`}
                    onClick={() => {
                      updateStatus(s);
                      setStatusPickerOpen(false);
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </Modal>
          )}

          {areaPickerOpen && (
            <Modal title="Change area" onClose={() => setAreaPickerOpen(false)}>
              <div className={styles.pickerOptions}>
                <button
                  type="button"
                  className={`${styles.pickerOption} ${!project.areaId ? styles.pickerOptionActive : ''}`}
                  onClick={() => {
                    updateAreaId(null);
                    setAreaPickerOpen(false);
                  }}
                >
                  No area
                </button>
                {areas.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`${styles.pickerOption} ${project.areaId === a.id ? styles.pickerOptionActive : ''}`}
                    onClick={() => {
                      updateAreaId(a.id);
                      setAreaPickerOpen(false);
                    }}
                  >
                    {a.emoji ? `${a.emoji} ` : ''}
                    {a.name}
                  </button>
                ))}
              </div>
            </Modal>
          )}

          <p className={styles.dateRange}>
            {project.startDate ? formatDate(project.startDate.toDate()) : '—'}
            {' - '}
            {project.endDate ? formatDate(project.endDate.toDate()) : '—'}
          </p>

          <div>
            <h2 className={styles.sectionTitle}>Description</h2>
            <p className={styles.descriptionText}>{descriptionShown || 'No description.'}</p>
            {descriptionIsLong && (
              <button type="button" className={styles.readMoreButton} onClick={() => setDescriptionExpanded((v) => !v)}>
                {descriptionExpanded ? 'Read less' : 'Read more'}
              </button>
            )}
          </div>

          {activitySegments.length > 0 && (
            <div className={styles.activityCard}>
              <p className={styles.activityTitle}>Activity</p>
              <DonutChart segments={activitySegments} legendPosition="bottom" />
            </div>
          )}

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Tasks</h2>
            <div className={styles.taskActions}>
              <button type="button" className={styles.filterButton} onClick={() => setTaskFilterOpen(true)}>
                {TASK_TAB_LABEL[taskTab]}
                <ChevronDown size={13} strokeWidth={2.5} />
              </button>
              <button type="button" className={styles.addIconButton} onClick={openAddTask} aria-label="Add task">
                <Plus size={16} strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {taskFilterOpen && (
            <Modal title="Show tasks" onClose={() => setTaskFilterOpen(false)}>
              <div className={styles.pickerOptions}>
                {TASK_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`${styles.pickerOption} ${taskTab === tab ? styles.pickerOptionActive : ''}`}
                    onClick={() => {
                      setTaskTab(tab);
                      setTaskFilterOpen(false);
                    }}
                  >
                    {TASK_TAB_LABEL[tab]}
                  </button>
                ))}
              </div>
            </Modal>
          )}

          {tasks.length === 0 ? (
            <p className={styles.emptyText}>No tasks here.</p>
          ) : (
            <div className={styles.list}>
              {tasks.map((task) => (
                <div key={task.id} className={styles.taskRow}>
                  <span className={styles.taskEmoji}>{task.emoji ?? '📌'}</span>
                  <div className={styles.taskInfo} onClick={() => openTask(task.id)}>
                    <span className={styles.taskTypeTag}>{TASK_TYPE_LABEL[task.type]}</span>
                    <p className={`${styles.taskTitle} ${task.done ? styles.taskTitleDone : ''}`}>{task.title}</p>
                    {formatTaskDateRange(task.startTime, task.dueDate) && (
                      <span className={styles.taskTimestamp}>{formatTaskDateRange(task.startTime, task.dueDate)}</span>
                    )}
                    {(task.overdue || task.rescheduled) && (
                      <span className={styles.taskFlags}>
                        {task.overdue && <span className={styles.taskMetaDanger}>Overdue</span>}
                        {task.rescheduled && (
                          <span className={styles.taskMetaReschedule}>{task.extended ? 'Extended' : 'Shortened'}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className={styles.doneCheckbox}
                    checked={task.done}
                    onChange={(event) => toggleTaskDone(task.id, event.target.checked)}
                    aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                  />
                  <TaskQuickActionsMenu
                    taskId={task.id}
                    priority={task.priority}
                    done={task.done}
                    dueDate={task.dueDate}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
