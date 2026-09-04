'use client';

import { ChevronLeft } from 'lucide-react';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { useLogic } from '@/src/logic/taskEdit/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { TimeField } from '@/src/widgets/TimeField/TimeField';
import { DateField } from '@/src/widgets/DateField/DateField';
import { TASK_TYPES, TASK_TYPE_LABEL, PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import styles from './TaskEditScreen.module.css';

export function TaskEditScreen({ taskId }: { taskId: string | null }) {
  const {
    isEditing,
    projects,
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{isEditing ? 'Edit task' : 'New task'}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <div className={styles.form}>
          <div className={styles.titleRow}>
            <EmojiPicker value={emoji} onChange={setEmoji} label="Task emoji" noneLabel="No emoji" />
            <div className={styles.titleField}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="task-title">
                  Title
                </label>
                <input
                  id="task-title"
                  className={styles.formInput}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What needs doing?"
                />
              </div>
            </div>
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>Type</span>
            <div className={styles.chipGroup}>
              {TASK_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.chip} ${type === option ? styles.chipActive : ''}`}
                  onClick={() => setType(option)}
                >
                  {TASK_TYPE_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>Priority</span>
            <div className={styles.chipGroup}>
              {PRIORITY_LEVELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.chip} ${priority === option ? styles.chipActive : ''}`}
                  onClick={() => setPriority(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="task-project">
              Project
            </label>
            <select
              id="task-project"
              className={styles.formInput}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">No project (standalone)</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.emoji ? `${project.emoji} ` : ''}
                  {project.name}
                </option>
              ))}
            </select>
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

          <DateField id="task-date" label="Date" value={date} onChange={setDate} />

          {/* Tasks are day-bound — one date above, a start and an end time
              of day here, never a second datetime-local that could drift
              onto a different day. */}
          <TimeField id="task-start-time" label="Start time" value={startTimeOfDay} onChange={setStartTimeOfDay} />
          <TimeField id="task-end-time" label="End time" value={endTimeOfDay} onChange={setEndTimeOfDay} />

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="task-notes">
              Notes
            </label>
            <textarea
              id="task-notes"
              className={styles.formTextarea}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {isEditing && (
            <button type="button" className={styles.deleteLink} onClick={openDeleteConfirm}>
              Delete task
            </button>
          )}

          {saveError && <p className={styles.errorText}>{saveError}</p>}

          <button
            type="button"
            className={styles.saveButton}
            disabled={!title.trim() || !date || !startTimeOfDay || !endTimeOfDay || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
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
