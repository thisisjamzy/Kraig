'use client';

import { useState } from 'react';
import { Calendar as HeroCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  FolderKanban,
  Info,
  AlertTriangle,
  CircleDot,
  Plus,
  CalendarDays,
} from 'lucide-react';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { useLogic } from '@/src/logic/taskEdit/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { TimeField } from '@/src/widgets/TimeField/TimeField';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import { PRIORITY_LEVELS, TASK_TYPE_ICON, taskTypeLabel } from '@/src/viewmodels/projects';
import styles from './TaskEditScreen.module.css';

function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function TaskEditScreen({ taskId }: { taskId: string | null }) {
  const {
    isEditing,
    projects,
    view,
    openDetails,
    closeDetails,
    taskTypeOptions,
    newTaskTypeError,
    addCustomTaskType,
    title,
    setTitle,
    emoji,
    setEmoji,
    type,
    setType,
    priority,
    setPriority,
    projectId,
    setProjectId,
    done,
    setDone,
    date,
    setDate,
    startTimeOfDay,
    setStartTimeOfDay,
    endTimeOfDay,
    setEndTimeOfDay,
    notes,
    setNotes,
    isValid,
    saving,
    saveError,
    handleSave,
    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    goBack,
    loading,
    error,
  } = useLogic(taskId);

  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateMonthCursor, setDateMonthCursor] = useState(() => (date ? new Date(`${date}T00:00:00`) : new Date()));
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const TypeIcon = TASK_TYPE_ICON[type] ?? CircleDot;

  return (
    <div className={styles.page}>
      {view === 'form' ? (
        <>
          <header className={styles.header}>
            <button type="button" className={styles.iconButton} onClick={goBack} aria-label="Close">
              <X size={18} strokeWidth={2} />
            </button>
            <h1 className={styles.headerTitle}>{isEditing ? 'Edit task' : 'New task'}</h1>
            <button
              type="button"
              className={`${styles.saveIconButton} ${isValid ? styles.saveIconButtonActive : ''}`}
              disabled={!isValid || saving}
              onClick={handleSave}
              aria-label="Save"
            >
              <Check size={18} strokeWidth={2.5} />
            </button>
          </header>
          <div className={styles.emojiRow}>
            <EmojiPicker value={emoji} onChange={setEmoji} label="Task emoji" noneLabel="No emoji" />
          </div>
        </>
      ) : (
        <header className={styles.header}>
          <button type="button" className={styles.iconButton} onClick={closeDetails} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <h1 className={styles.headerTitle}>Details</h1>
          <button
            type="button"
            className={`${styles.saveIconButton} ${isValid ? styles.saveIconButtonActive : ''}`}
            disabled={!isValid || saving}
            onClick={handleSave}
            aria-label="Save"
          >
            <Check size={18} strokeWidth={2.5} />
          </button>
        </header>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && view === 'form' && (
        <div className={styles.form}>
          <div className={styles.card}>
            <input
              className={styles.titleInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title"
            />
            <div className={styles.cardDivider} />
            <textarea
              className={styles.notesInput}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes"
            />
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setProjectPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <FolderKanban size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Project</span>
              <span className={styles.listRowValue}>{selectedProject ? selectedProject.name : 'None'}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {projectPickerOpen && (
              <div className={styles.expandPanel}>
                <button
                  type="button"
                  className={`${styles.optionRow} ${!projectId ? styles.optionRowActive : ''}`}
                  onClick={() => {
                    setProjectId('');
                    setProjectPickerOpen(false);
                  }}
                >
                  No project (standalone)
                </button>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`${styles.optionRow} ${projectId === project.id ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setProjectId(project.id);
                      setProjectPickerOpen(false);
                    }}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setDatePickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <CalendarDays size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Date</span>
              <span className={styles.listRowValue}>{date ? formatDateOnly(date) : 'Select date'}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {datePickerOpen && (
              <div className={styles.expandPanel}>
                <HeroCalendar.Root
                  focusedValue={parseDate(toDateOnly(dateMonthCursor))}
                  onFocusChange={(next) => setDateMonthCursor(new Date(next.year, next.month - 1, next.day))}
                  value={date ? parseDate(date) : undefined}
                  onChange={(next) => {
                    if (next) {
                      setDate(next.toString());
                      setDatePickerOpen(false);
                    }
                  }}
                >
                  <HeroCalendar.Header className={styles.calendarHeader}>
                    <HeroCalendar.NavButton slot="previous" className={styles.calendarNavButton} />
                    <HeroCalendar.Heading className={styles.calendarHeading} />
                    <HeroCalendar.NavButton slot="next" className={styles.calendarNavButton} />
                  </HeroCalendar.Header>
                  <HeroCalendar.Grid className={styles.calendarGrid}>
                    <HeroCalendar.GridHeader>
                      {(day) => <HeroCalendar.HeaderCell className={styles.weekdayCell}>{day}</HeroCalendar.HeaderCell>}
                    </HeroCalendar.GridHeader>
                    <HeroCalendar.GridBody>
                      {(cellDate) => (
                        <HeroCalendar.Cell date={cellDate} className={styles.dayCell}>
                          {({ formattedDate }) => <span className={styles.dayCellInner}>{formattedDate}</span>}
                        </HeroCalendar.Cell>
                      )}
                    </HeroCalendar.GridBody>
                  </HeroCalendar.Grid>
                </HeroCalendar.Root>
              </div>
            )}
          </div>

          {/* Tasks are day-bound — one date above, a start and an end time
              of day here, never a second datetime-local that could drift
              onto a different day. */}
          <div className={styles.listGroup}>
            <TimeField id="task-start-time" label="Start time" value={startTimeOfDay} onChange={setStartTimeOfDay} />
            <div className={styles.cardDivider} />
            <TimeField id="task-end-time" label="End time" value={endTimeOfDay} onChange={setEndTimeOfDay} />
          </div>

          {isEditing && (
            <label className={styles.checkboxRow} htmlFor="task-done">
              <input
                id="task-done"
                type="checkbox"
                className={styles.checkbox}
                checked={done}
                onChange={(event) => setDone(event.target.checked)}
              />
              Mark as complete
            </label>
          )}

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={openDetails}>
              <span className={styles.listRowIcon}>
                <Info size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Details</span>
              <span className={styles.listRowValue}>
                {priority} · {taskTypeLabel(type)}
              </span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
          </div>

          {isEditing && (
            <button type="button" className={styles.deleteLink} onClick={openDeleteConfirm}>
              Delete task
            </button>
          )}

          {saveError && <p className={styles.errorText}>{saveError}</p>}
        </div>
      )}

      {!loading && !error && view === 'details' && (
        <div className={styles.form}>
          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setPriorityPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <AlertTriangle size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Priority</span>
              <span className={styles.listRowValue}>{priority}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {priorityPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  {PRIORITY_LEVELS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.chip} ${priority === option ? styles.chipActive : ''}`}
                      onClick={() => {
                        setPriority(option);
                        setPriorityPickerOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setTypePickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <TypeIcon size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Task type</span>
              <span className={styles.listRowValue}>{taskTypeLabel(type)}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {typePickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  {taskTypeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.chip} ${type === option ? styles.chipActive : ''}`}
                      onClick={() => setType(option)}
                    >
                      {taskTypeLabel(option)}
                    </button>
                  ))}
                </div>
                <div className={styles.newTypeRow}>
                  <input
                    className={styles.newTypeInput}
                    value={newTypeName}
                    onChange={(event) => setNewTypeName(event.target.value)}
                    placeholder="Add a type — e.g. Errand"
                  />
                  <button
                    type="button"
                    className={styles.newTypeAddButton}
                    onClick={() => {
                      addCustomTaskType(newTypeName);
                      setNewTypeName('');
                    }}
                    aria-label="Add task type"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                </div>
                {newTaskTypeError && <p className={styles.errorText}>{newTaskTypeError}</p>}
                <p className={styles.hintText}>One capitalized word, e.g. &quot;Errand&quot; or &quot;Workout&quot;.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <ConfirmDialog
          title="Delete this task?"
          message="It'll be removed from every list — this can't be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}
