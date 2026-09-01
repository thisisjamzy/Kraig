'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic, CATEGORY_TYPES } from '@/src/logic/createCategory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import styles from './CreateCategoryScreen.module.css';

export function CreateCategoryScreen() {
  const strings = useStrings();
  const { name, setName, type, setType, description, setDescription, saving, error, handleSave, goBack } =
    useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.createCategory.title}</h1>
      </header>

      <div className={styles.form}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="create-category-name">
            {strings.createCategory.nameLabel}
          </label>
          <input
            id="create-category-name"
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
          <label className={styles.formLabel} htmlFor="create-category-description">
            {strings.createCategory.descriptionLabel}
          </label>
          <textarea
            id="create-category-description"
            className={styles.formTextarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={strings.createCategory.descriptionPlaceholder}
            rows={3}
          />
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        <button type="button" className={styles.saveButton} disabled={!name.trim() || saving} onClick={handleSave}>
          {saving ? strings.createCategory.saving : strings.createCategory.save}
        </button>
      </div>
    </div>
  );
}
