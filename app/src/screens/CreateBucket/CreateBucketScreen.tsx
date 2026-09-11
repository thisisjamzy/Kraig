'use client';

import { useState } from 'react';
import { X, Check, ChevronRight, Layers, Palette } from 'lucide-react';
import { useLogic } from '@/src/logic/createBucket/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import styles from './CreateBucketScreen.module.css';

export function CreateBucketScreen({ areaId }: { areaId: string }) {
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
    isValid,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
    error,
  } = useLogic(areaId);

  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} onClick={goBack} aria-label="Close">
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.headerTitle}>New bucket</h1>
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
        <EmojiPicker value={emoji} onChange={setEmoji} label="Bucket emoji" noneLabel="No emoji" />
      </div>

      <ScreenState loading={loading} error={error} />

      {!hasAreaId && !loading && (
        <p className={styles.errorText}>A bucket needs an area — open it from that area&apos;s own page.</p>
      )}

      {hasAreaId && !loading && !error && (
        <div className={styles.form}>
          <div className={styles.card}>
            <input
              className={styles.titleInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
            />
            <div className={styles.cardDivider} />
            <textarea
              className={styles.notesInput}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
            />
          </div>

          {area && (
            <div className={styles.listGroup}>
              <div className={`${styles.listRow} ${styles.listRowStatic}`}>
                <span className={styles.listRowIcon}>
                  <Layers size={16} strokeWidth={2} />
                </span>
                <span className={styles.listRowLabel}>Area</span>
                <span className={styles.listRowValue}>{area.name}</span>
              </div>
            </div>
          )}

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setColorPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Palette size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Color</span>
              <span className={styles.listRowSwatch} style={{ background: color }} />
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {colorPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.colorGrid}>
                  {PROJECT_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`${styles.colorSwatch} ${color === swatch ? styles.colorSwatchActive : ''}`}
                      style={{ background: swatch }}
                      aria-label={swatch}
                      onClick={() => {
                        setColor(swatch);
                        setColorPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {saveError && <p className={styles.errorText}>{saveError}</p>}
        </div>
      )}
    </div>
  );
}
