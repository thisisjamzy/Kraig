'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic, CATEGORY_TYPES } from '@/src/logic/categoryEdit/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './CategoryEditScreen.module.css';

export function CategoryEditScreen({ categoryId }: { categoryId: string }) {
  const strings = useStrings();
  const { name, setName, type, setType, description, setDescription, saving, saveError, handleSave, goBack, loading, error } =
    useLogic(categoryId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.categories.editTitle}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-category-name">
              {strings.createCategory.nameLabel}
            </label>
            <input
              id="edit-category-name"
              className={styles.formInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.createCategory.namePlaceholder}
            />
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.createCategory.typeLabel}</span>
            <div className={styles.typeGroup}>
              {CATEGORY_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.typeOption} ${type === option ? styles.typeOptionActive : ''}`}
                  onClick={() => setType(option)}
                >
                  {strings.budget.typeLabels[option]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-category-description">
              {strings.createCategory.descriptionLabel}
            </label>
            <textarea
              id="edit-category-description"
              className={styles.formTextarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.createCategory.descriptionPlaceholder}
              rows={3}
            />
          </div>

          {saveError && <p className={styles.errorText}>{saveError}</p>}

          <button type="button" className={styles.saveButton} disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? strings.categories.savingChanges : strings.categories.saveChanges}
          </button>
        </div>
      )}
    </div>
  );
}
