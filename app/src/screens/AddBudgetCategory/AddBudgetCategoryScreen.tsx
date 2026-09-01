'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic, BUDGET_LINE_TYPES, CATEGORY_CREATE_TYPES } from '@/src/logic/addBudgetCategory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './AddBudgetCategoryScreen.module.css';

export function AddBudgetCategoryScreen() {
  const strings = useStrings();
  const {
    goBack,
    type,
    setType,
    categoryId,
    setCategoryId,
    categoryOptions,
    description,
    setDescription,
    amount,
    setAmount,
    recurrence,
    setRecurrence,
    recurrenceMonths,
    setRecurrenceMonths,
    saving,
    saveError,
    handleSave,

    showCreateCategory,
    openCreateCategory,
    closeCreateCategory,
    newCategoryName,
    setNewCategoryName,
    newCategoryType,
    setNewCategoryType,
    newCategoryDescription,
    setNewCategoryDescription,
    creatingCategory,
    createCategoryError,
    handleCreateCategory,

    loading,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.addBudgetCategory.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.addBudgetCategory.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.addBudgetCategory.typeLabel}</span>
            <div className={styles.recurrenceGroup}>
              {BUDGET_LINE_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.recurrenceOption} ${type === option ? styles.recurrenceOptionActive : ''}`}
                  onClick={() => setType(option)}
                >
                  {strings.budget.typeLabels[option]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="budget-category-id">
              {strings.addBudgetCategory.categoryLabel}
            </label>
            {categoryOptions.length === 0 ? (
              <p className={styles.emptyText}>{strings.addBudgetCategory.noCategoriesLeft}</p>
            ) : (
              <select
                id="budget-category-id"
                className={styles.formInput}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="" disabled>
                  {strings.addBudgetCategory.categoryPlaceholder}
                </option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {type !== 'Transfer' &&
            (showCreateCategory ? (
              <div className={styles.createCategoryCard}>
                <div className={styles.createCategoryHeaderRow}>
                  <p className={styles.createCategoryTitle}>{strings.createCategory.title}</p>
                  <button type="button" className={styles.linkButton} onClick={closeCreateCategory}>
                    {strings.addBudgetCategory.cancelCreateCategory}
                  </button>
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="new-category-name">
                    {strings.createCategory.nameLabel}
                  </label>
                  <input
                    id="new-category-name"
                    className={styles.formInput}
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder={strings.createCategory.namePlaceholder}
                  />
                </div>
                <div className={styles.formField}>
                  <span className={styles.formLabel}>{strings.createCategory.typeLabel}</span>
                  <div className={styles.recurrenceGroup}>
                    {CATEGORY_CREATE_TYPES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.recurrenceOption} ${
                          newCategoryType === option ? styles.recurrenceOptionActive : ''
                        }`}
                        onClick={() => setNewCategoryType(option)}
                      >
                        {strings.budget.typeLabels[option]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="new-category-description">
                    {strings.createCategory.descriptionLabel}
                  </label>
                  <textarea
                    id="new-category-description"
                    className={styles.formTextarea}
                    value={newCategoryDescription}
                    onChange={(event) => setNewCategoryDescription(event.target.value)}
                    placeholder={strings.createCategory.descriptionPlaceholder}
                    rows={2}
                  />
                </div>
                {createCategoryError && <p className={styles.errorText}>{createCategoryError}</p>}
                <button
                  type="button"
                  className={styles.smallSaveButton}
                  disabled={!newCategoryName.trim() || creatingCategory}
                  onClick={handleCreateCategory}
                >
                  {creatingCategory ? strings.createCategory.saving : strings.createCategory.save}
                </button>
              </div>
            ) : (
              <button type="button" className={styles.linkButton} onClick={openCreateCategory}>
                {strings.addBudgetCategory.cantFindCategory} {strings.addBudgetCategory.createNewCategory}
              </button>
            ))}

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="budget-category-description">
              {strings.addBudgetCategory.descriptionLabel}
            </label>
            <textarea
              id="budget-category-description"
              className={styles.formTextarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.addBudgetCategory.descriptionPlaceholder}
              rows={3}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="budget-category-amount">
              {strings.addBudgetCategory.amountLabel}
            </label>
            <input
              id="budget-category-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.addBudgetCategory.repeatsLabel}</span>
            <div className={styles.recurrenceGroup}>
              {strings.budget.recurrenceOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.recurrenceOption} ${
                    recurrence === option.key ? styles.recurrenceOptionActive : ''
                  }`}
                  onClick={() => setRecurrence(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {recurrence === 'limited' && (
              <div className={styles.recurrenceMonthsRow}>
                <input
                  className={styles.recurrenceMonthsInput}
                  inputMode="numeric"
                  value={recurrenceMonths}
                  onChange={(event) => setRecurrenceMonths(event.target.value.replace(/[^0-9]/g, ''))}
                />
                <span className={styles.recurrenceMonthsLabel}>{strings.budget.monthsSuffix}</span>
              </div>
            )}
          </div>

          {saveError && <p className={styles.errorText}>{saveError}</p>}

          <button type="button" className={styles.saveButton} disabled={!categoryId || saving} onClick={handleSave}>
            {saving ? strings.addBudgetCategory.saving : strings.addBudgetCategory.save}
          </button>
        </div>
      )}
    </div>
  );
}
