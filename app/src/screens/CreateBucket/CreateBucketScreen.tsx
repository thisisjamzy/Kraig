'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/createBucket/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import styles from './CreateBucketScreen.module.css';

export function CreateBucketScreen() {
  const {
    area,
    hasAreaId,
    name,
    setName,
    emoji,
    setEmoji,
    color,
    setColor,
    description,
    setDescription,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
    error,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>New bucket</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!hasAreaId && !loading && (
        <p className={styles.errorText}>A bucket needs an area — open it from that area's own page.</p>
      )}

      {hasAreaId && !loading && !error && (
        <div className={styles.form}>
          {area && (
            <div className={styles.areaField}>
              <span className={styles.formLabel}>Area</span>
              <span className={styles.areaChip}>
                {area.emoji ? `${area.emoji} ` : ''}
                {area.name}
              </span>
            </div>
          )}

          <div className={styles.titleRow}>
            <EmojiPicker value={emoji} onChange={setEmoji} label="Bucket emoji" noneLabel="No emoji" />
            <div className={styles.titleField}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="bucket-name">
                  Name
                </label>
                <input
                  id="bucket-name"
                  className={styles.formInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Groceries"
                />
              </div>
            </div>
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
            <label className={styles.formLabel} htmlFor="bucket-description">
              Description
            </label>
            <textarea
              id="bucket-description"
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
            {saving ? 'Creating…' : 'Create bucket'}
          </button>
        </div>
      )}
    </div>
  );
}
