'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/createGoal/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './CreateGoalScreen.module.css';

export function CreateGoalScreen() {
  const strings = useStrings();
  const {
    name,
    setName,
    description,
    setDescription,
    deadline,
    setDeadline,
    currency,
    setCurrency,
    currencyOptions,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.goalDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.createGoal.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-name">
              {strings.createGoal.nameLabel}
            </label>
            <input
              id="goal-name"
              className={styles.formInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.createGoal.namePlaceholder}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-description">
              {strings.createGoal.descriptionLabel}
            </label>
            <textarea
              id="goal-description"
              className={styles.formTextarea}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-currency">
              {strings.createGoal.currencyLabel}
            </label>
            <select
              id="goal-currency"
              className={styles.formInput}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-deadline">
              {strings.createGoal.deadlineLabel}
            </label>
            <input
              id="goal-deadline"
              type="date"
              className={styles.formInput}
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>

          <p className={styles.hintText}>{strings.createGoal.addLineItemsHint}</p>

          {saveError && <p className={styles.errorText}>{saveError}</p>}

          <button type="button" className={styles.saveButton} disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? strings.createGoal.saving : strings.createGoal.save}
          </button>
        </div>
      )}
    </div>
  );
}
