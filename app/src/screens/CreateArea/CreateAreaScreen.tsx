'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/createArea/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { PROJECT_COLORS } from '@/src/viewmodels/projects';
import styles from './CreateAreaScreen.module.css';

export function CreateAreaScreen() {
  const { name, setName, emoji, setEmoji, color, setColor, description, setDescription, saving, saveError, handleSave, goBack } =
    useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>New area</h1>
      </header>

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
                placeholder="e.g. Home"
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
          {saving ? 'Creating…' : 'Create area'}
        </button>
      </div>
    </div>
  );
}
