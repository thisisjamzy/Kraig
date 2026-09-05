'use client';

import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/projectEdit/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { DateRangeField } from '@/src/widgets/DateRangeField/DateRangeField';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { PROJECT_COLORS, PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import type { ProjectStatus } from '@/src/shared/firestore/types';
import styles from './ProjectEditScreen.module.css';

const STATUSES: ProjectStatus[] = ['Active', 'Completed', 'Archived'];

export function ProjectEditScreen({ projectId }: { projectId: string }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const {
    project,
    areas,
    name,
    setName,
    emoji,
    setEmoji,
    areaId,
    setAreaId,
    color,
    setColor,
    priority,
    setPriority,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    status,
    setStatus,
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    archiveProject,
    unarchiveProject,
    goBack,
    loading,
    error,
  } = useLogic(projectId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Edit project</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && project && (
        <>
          <div className={styles.form}>
            <div className={styles.titleRow}>
              <EmojiPicker value={emoji} onChange={setEmoji} label="Project emoji" noneLabel="No emoji" />
              <div className={styles.titleField}>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="project-name">
                    Name
                  </label>
                  <input
                    id="project-name"
                    className={styles.formInput}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="project-area">
                Area (optional)
              </label>
              <select
                id="project-area"
                className={styles.formInput}
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
              >
                <option value="">No area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.emoji ? `${area.emoji} ` : ''}
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <span className={styles.formLabel}>Color</span>
              <div className={styles.colorGrid}>
                {PROJECT_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={`${styles.colorSwatch} ${color === swatch ? styles.colorSwatchActive : ''}`}
                    style={{ background: swatch }}
                    aria-label={swatch}
                    onClick={() => setColor(swatch)}
                  />
                ))}
              </div>
            </div>

            <div className={styles.formField}>
              <span className={styles.formLabel}>Status</span>
              <div className={styles.chipGroup}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.chip} ${status === s ? styles.chipActive : ''}`}
                    onClick={() => setStatus(s)}
                  >
                    {s}
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

            <DateRangeField
              id="project-timeline"
              label="Timeline (optional)"
              startValue={startDate}
              endValue={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="project-description">
                Description
              </label>
              <textarea
                id="project-description"
                className={styles.formTextarea}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {saveError && <p className={styles.errorText}>{saveError}</p>}

            <button
              type="button"
              className={styles.saveButton}
              disabled={!name.trim() || !description.trim() || saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className={styles.dangerCard}>
            <p className={styles.dangerTitle}>Archive</p>
            {project.status === 'Archived' ? (
              <>
                <span className={styles.archivedBadge}>Archived</span>
                <button type="button" className={styles.unarchiveButton} onClick={unarchiveProject}>
                  Unarchive project
                </button>
              </>
            ) : (
              <>
                <p className={styles.sectionCaption}>
                  Hides it from your Projects tab. Its tasks stay intact and can still be reached individually.
                </p>
                <button type="button" className={styles.archiveButton} onClick={() => setConfirmArchive(true)}>
                  Archive project
                </button>
              </>
            )}
          </div>
        </>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Archive this project?"
          message="Hides it from your Projects tab. Its tasks stay intact and can still be reached individually, and you can unarchive it later."
          confirmLabel="Archive project"
          cancelLabel="Cancel"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            archiveProject();
            setConfirmArchive(false);
          }}
        />
      )}
    </div>
  );
}
