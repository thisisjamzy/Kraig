'use client';

import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/bucketEdit/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import styles from './BucketEditScreen.module.css';

export function BucketEditScreen({ bucketId }: { bucketId: string }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const {
    bucket,
    area,
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
    archiveBucket,
    unarchiveBucket,
    goBack,
    loading,
    error,
  } = useLogic(bucketId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Edit bucket</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && bucket && (
        <>
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
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className={styles.dangerCard}>
            <p className={styles.dangerTitle}>Archive</p>
            {bucket.archived ? (
              <>
                <span className={styles.archivedBadge}>Archived</span>
                <button type="button" className={styles.unarchiveButton} onClick={unarchiveBucket}>
                  Unarchive bucket
                </button>
              </>
            ) : (
              <>
                <p className={styles.sectionCaption}>
                  Hides it from its area and the bucket picker. Its projects and tasks stay intact.
                </p>
                <button type="button" className={styles.archiveButton} onClick={() => setConfirmArchive(true)}>
                  Archive bucket
                </button>
              </>
            )}
          </div>
        </>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Archive this bucket?"
          message="Hides it from its area and the bucket picker. Its projects and tasks stay intact, and you can unarchive it later."
          confirmLabel="Archive bucket"
          cancelLabel="Cancel"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            archiveBucket();
            setConfirmArchive(false);
          }}
        />
      )}
    </div>
  );
}
