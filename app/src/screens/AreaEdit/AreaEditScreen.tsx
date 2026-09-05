'use client';

import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/areaEdit/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import styles from './AreaEditScreen.module.css';

export function AreaEditScreen({ areaId }: { areaId: string }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const {
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
    archiveArea,
    unarchiveArea,
    goBack,
    loading,
    error,
  } = useLogic(areaId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Edit area</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && area && (
        <>
          <div className={styles.form}>
            <div className={styles.titleRow}>
              <EmojiPicker value={emoji} onChange={setEmoji} label="Area emoji" noneLabel="No emoji" />
              <div className={styles.titleField}>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="area-name">
                    Name
                  </label>
                  <input
                    id="area-name"
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
              <label className={styles.formLabel} htmlFor="area-description">
                Description
              </label>
              <textarea
                id="area-description"
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
            {area.archived ? (
              <>
                <span className={styles.archivedBadge}>Archived</span>
                <button type="button" className={styles.unarchiveButton} onClick={unarchiveArea}>
                  Unarchive area
                </button>
              </>
            ) : (
              <>
                <p className={styles.sectionCaption}>
                  Hides it from your Areas tab and the area picker. Its projects and tasks stay intact.
                </p>
                <button type="button" className={styles.archiveButton} onClick={() => setConfirmArchive(true)}>
                  Archive area
                </button>
              </>
            )}
          </div>
        </>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Archive this area?"
          message="Hides it from your Areas tab and the area picker. Its projects and tasks stay intact, and you can unarchive it later."
          confirmLabel="Archive area"
          cancelLabel="Cancel"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            archiveArea();
            setConfirmArchive(false);
          }}
        />
      )}
    </div>
  );
}
