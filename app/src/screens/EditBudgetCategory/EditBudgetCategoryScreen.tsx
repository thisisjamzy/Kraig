'use client';

import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useLogic, BUDGET_LINE_TYPES } from '@/src/logic/editBudgetCategory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './EditBudgetCategoryScreen.module.css';

export function EditBudgetCategoryScreen({ ruleId }: { ruleId: string }) {
  const strings = useStrings();
  const {
    goBack,

    isOnce,
    hasMonthOverride,

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

    endMonthIndex,
    endYear,
    endPickerOpen,
    openEndPicker,
    closeEndPicker,
    endPickerYear,
    setEndPickerYear,
    chooseEndMonth,

    saving,
    saveError,
    handleSave,

    loading,
    notFound,
  } = useLogic(ruleId);

  const monthNames = strings.months;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.addBudgetCategory.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.editBudgetCategory.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && notFound && <p className={styles.emptyText}>{strings.editBudgetCategory.notFound}</p>}

      {!loading && !notFound && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.budget.typeLabel}</span>
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
            <label className={styles.formLabel} htmlFor="edit-budget-category-id">
              {strings.budget.categoryLabel}
            </label>
            {categoryOptions.length === 0 ? (
              <p className={styles.emptyText}>{strings.budget.noCategoriesLeft}</p>
            ) : (
              <select
                id="edit-budget-category-id"
                className={styles.formInput}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {categoryId === '' && (
                  <option value="" disabled>
                    {strings.budget.categoryPlaceholder}
                  </option>
                )}
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-budget-category-description">
              {strings.budget.descriptionLabel}
            </label>
            <textarea
              id="edit-budget-category-description"
              className={styles.formTextarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.budget.descriptionPlaceholder}
              rows={3}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-budget-category-amount">
              {strings.budget.amountLabel}
            </label>
            <input
              id="edit-budget-category-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.budget.editRecurrenceLabel}</span>
            <div className={styles.recurrenceGroup}>
              {strings.budget.recurrenceOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.recurrenceOption} ${recurrence === option.key ? styles.recurrenceOptionActive : ''}`}
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

          {recurrence === 'until' && (
            <div className={styles.formField}>
              <span className={styles.formLabel}>{strings.addBudgetCategory.endMonthLabel}</span>
              <button type="button" className={styles.monthPickerButton} onClick={openEndPicker}>
                {monthNames[endMonthIndex]} {endYear}
                <ChevronDown size={14} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {hasMonthOverride && <p className={styles.overrideHint}>{strings.budget.monthOverrideHint}</p>}

          {saveError && (
            <p className={styles.errorText} role="alert">
              {saveError}
            </p>
          )}

          {isOnce ? (
            <button
              type="button"
              className={styles.saveButton}
              disabled={!categoryId || saving}
              onClick={() => handleSave('allMonths')}
            >
              {saving ? strings.editBudgetCategory.saving : strings.common.save}
            </button>
          ) : (
            <div className={styles.saveRow}>
              <button
                type="button"
                className={styles.saveThisMonthButton}
                disabled={!categoryId || saving}
                onClick={() => handleSave('thisMonth')}
              >
                {strings.budget.saveThisMonthOnly}
              </button>
              <button
                type="button"
                className={styles.saveButton}
                disabled={!categoryId || saving}
                onClick={() => handleSave('allMonths')}
              >
                {strings.budget.saveAllMonths}
              </button>
            </div>
          )}
        </div>
      )}

      {endPickerOpen && (
        <Modal title={strings.addBudgetCategory.chooseEndMonth} onClose={closeEndPicker}>
          <div className={styles.yearStepper}>
            <button
              type="button"
              className={styles.yearStepButton}
              onClick={() => setEndPickerYear((value) => value - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className={styles.yearStepValue}>{endPickerYear}</span>
            <button
              type="button"
              className={styles.yearStepButton}
              onClick={() => setEndPickerYear((value) => value + 1)}
              aria-label="Next year"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className={styles.monthGrid}>
            {monthNames.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`${styles.monthButton} ${
                  index === endMonthIndex && endPickerYear === endYear ? styles.monthButtonActive : ''
                }`}
                onClick={() => chooseEndMonth(index)}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
