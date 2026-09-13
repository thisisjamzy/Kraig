'use client';

import { useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { Calendar as HeroCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { useLogic } from '@/src/logic/createGoal/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import styles from './CreateGoalScreen.module.css';

function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

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
    kind,
    setKind,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
  } = useLogic();

  const [deadlinePickerOpen, setDeadlinePickerOpen] = useState(false);
  const [deadlineMonthCursor, setDeadlineMonthCursor] = useState(() =>
    deadline ? new Date(`${deadline}T00:00:00`) : new Date()
  );

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
            <span className={styles.formLabel}>{strings.createGoal.kindLabel}</span>
            <div className={styles.chipGroup}>
              <button
                type="button"
                className={`${styles.chip} ${kind === 'Variable' ? styles.chipActive : ''}`}
                onClick={() => setKind('Variable')}
              >
                {strings.createGoal.kindVariable}
              </button>
              <button
                type="button"
                className={`${styles.chip} ${kind === 'Fixed' ? styles.chipActive : ''}`}
                onClick={() => setKind('Fixed')}
              >
                {strings.createGoal.kindFixed}
              </button>
            </div>
            <p className={styles.hintText}>
              {kind === 'Fixed' ? strings.createGoal.kindFixedHint : strings.createGoal.kindVariableHint}
            </p>
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
            <span className={styles.formLabel}>{strings.createGoal.deadlineLabel}</span>
            <div className={styles.dateCard}>
              <div className={styles.dateTriggerRow}>
                <button
                  type="button"
                  className={styles.dateTrigger}
                  onClick={() => setDeadlinePickerOpen((c) => !c)}
                >
                  {deadline ? formatDateOnly(deadline) : strings.createGoal.deadlinePlaceholder}
                </button>
                {deadline && (
                  <button
                    type="button"
                    className={styles.clearDateButton}
                    onClick={() => setDeadline('')}
                    aria-label="Clear target date"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
              {deadlinePickerOpen && (
                <div className={styles.calendarPanel}>
                  <HeroCalendar.Root
                    focusedValue={parseDate(toDateOnly(deadlineMonthCursor))}
                    onFocusChange={(next) => setDeadlineMonthCursor(new Date(next.year, next.month - 1, next.day))}
                    value={deadline ? parseDate(deadline) : undefined}
                    onChange={(next) => {
                      if (next) {
                        setDeadline(next.toString());
                        setDeadlinePickerOpen(false);
                      }
                    }}
                  >
                    <HeroCalendar.Header className={styles.calendarHeader}>
                      <HeroCalendar.NavButton slot="previous" className={styles.calendarNavButton} />
                      <HeroCalendar.Heading className={styles.calendarHeading} />
                      <HeroCalendar.NavButton slot="next" className={styles.calendarNavButton} />
                    </HeroCalendar.Header>
                    <HeroCalendar.Grid className={styles.calendarGrid}>
                      <HeroCalendar.GridHeader>
                        {(day) => <HeroCalendar.HeaderCell className={styles.weekdayCell}>{day}</HeroCalendar.HeaderCell>}
                      </HeroCalendar.GridHeader>
                      <HeroCalendar.GridBody>
                        {(cellDate) => (
                          <HeroCalendar.Cell date={cellDate} className={styles.dayCell}>
                            {({ formattedDate }) => <span className={styles.dayCellInner}>{formattedDate}</span>}
                          </HeroCalendar.Cell>
                        )}
                      </HeroCalendar.GridBody>
                    </HeroCalendar.Grid>
                  </HeroCalendar.Root>
                </div>
              )}
            </div>
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
