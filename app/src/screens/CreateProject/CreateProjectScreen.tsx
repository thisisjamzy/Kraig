'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/createProject/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PROJECT_COLORS, PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import styles from './CreateProjectScreen.module.css';

export function CreateProjectScreen() {
  const strings = useStrings();
  const {
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
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.projectDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.createProject.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          <div className={styles.titleRow}>
            <EmojiPicker value={emoji} onChange={setEmoji} label="Project emoji" noneLabel="No emoji" />
            <div className={styles.titleField}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="project-name">
                  {strings.createProject.nameLabel}
                </label>
                <input
                  id="project-name"
                  className={styles.formInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={strings.createProject.namePlaceholder}
                />
              </div>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="project-area">
              {strings.createProject.areaLabel}
            </label>
            <select
              id="project-area"
              className={styles.formInput}
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
            >
              <option value="">{strings.createProject.noAreaOption}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.emoji ? `${area.emoji} ` : ''}
                  {area.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.createProject.colorLabel}</span>
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
            <label className={styles.formLabel} htmlFor="project-start-date">
              Start date
            </label>
            <input
              id="project-start-date"
              type="date"
              className={styles.formInput}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="project-end-date">
              {strings.createProject.plannedEndDateLabel}
            </label>
            <input
              id="project-end-date"
              type="date"
              className={styles.formInput}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="project-description">
              {strings.createProject.notesLabel}
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
            {saving ? strings.createProject.saving : strings.createProject.save}
          </button>
        </div>
      )}
    </div>
  );
}
