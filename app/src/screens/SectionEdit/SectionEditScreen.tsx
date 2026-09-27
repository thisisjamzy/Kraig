'use client';

import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/sectionEdit/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { PROJECT_COLORS, projectCoverImageUrl } from '@/src/viewmodels/projects';
import styles from './SectionEditScreen.module.css';

export function SectionEditScreen({ bucketId }: { bucketId: string }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const {
    section,
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
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Edit section"
      />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && section && (
        <>
          <div
            className={styles.cover}
            style={{ backgroundImage: `url(${projectCoverImageUrl(section.id)})` }}
            role="img"
            aria-label=""
          />

          <div className={styles.form}>
            {area && (
              <div className={styles.areaField}>
                <span className={styles.formLabel}>Area</span>
                <span className={styles.areaChip}>{area.name}</span>
              </div>
            )}

            <div className={styles.titleRow}>
              <EmojiPicker value={emoji} onChange={setEmoji} label="Section emoji" noneLabel="No emoji" />
              <div className={styles.titleField}>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="section-name">
                    Name
                  </label>
                  <input
                    id="section-name"
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
              <label className={styles.formLabel} htmlFor="section-description">
                Description
              </label>
              <textarea
                id="section-description"
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

          {section.isDefault ? (
            <p className={styles.sectionCaption}>
              This is the area&apos;s default section — every project here without one of its own lives in it, so it
              can&apos;t be archived.
            </p>
          ) : (
            <div className={styles.dangerCard}>
              <p className={styles.dangerTitle}>Archive</p>
              {section.archived ? (
                <>
                  <span className={styles.archivedBadge}>Archived</span>
                  <button type="button" className={styles.unarchiveButton} onClick={unarchiveBucket}>
                    Unarchive section
                  </button>
                </>
              ) : (
                <>
                  <p className={styles.sectionCaption}>
                    Hides it from its area and the section picker. Its projects and tasks stay intact.
                  </p>
                  <button type="button" className={styles.archiveButton} onClick={() => setConfirmArchive(true)}>
                    Archive section
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Archive this section?"
          message="Hides it from its area and the section picker. Its projects and tasks stay intact, and you can unarchive it later."
          confirmLabel="Archive section"
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
