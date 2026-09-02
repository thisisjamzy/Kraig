'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/debtPlanEdit/useLogic';
import { RECURRING_INTERVALS } from '@/src/logic/createDebt/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './DebtPlanEditScreen.module.css';

const INTERVAL_LABEL: Record<(typeof RECURRING_INTERVALS)[number], string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function DebtPlanEditScreen({ debtId }: { debtId: string }) {
  const strings = useStrings();
  const {
    debt,
    hasRecurring,
    setHasRecurring,
    amount,
    setAmount,
    planInterval,
    setPlanInterval,
    nextDate,
    setNextDate,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
    error,
  } = useLogic(debtId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.debtDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.debtDetail.editPlan}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && debt && (
        <div className={styles.form}>
          <div className={styles.toggleRow}>
            <span>{strings.createDebt.recurringToggle}</span>
            <input
              type="checkbox"
              checked={hasRecurring}
              onChange={(event) => setHasRecurring(event.target.checked)}
            />
          </div>

          {hasRecurring && (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="plan-amount">
                  {strings.createDebt.recurringAmountLabel}
                </label>
                <input
                  id="plan-amount"
                  className={styles.formInput}
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                />
              </div>
              <div className={styles.formField}>
                <span className={styles.formLabel}>{strings.createDebt.recurringIntervalLabel}</span>
                <div className={styles.recurrenceGroupRow}>
                  {RECURRING_INTERVALS.map((intervalOption) => (
                    <button
                      key={intervalOption}
                      type="button"
                      className={`${styles.recurrenceOption} ${
                        planInterval === intervalOption ? styles.recurrenceOptionActive : ''
                      }`}
                      onClick={() => setPlanInterval(intervalOption)}
                    >
                      {INTERVAL_LABEL[intervalOption]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="plan-next-date">
                  {strings.createDebt.recurringNextDateLabel}
                </label>
                <input
                  id="plan-next-date"
                  type="date"
                  className={styles.formInput}
                  value={nextDate}
                  onChange={(event) => setNextDate(event.target.value)}
                />
              </div>
            </>
          )}

          {saveError && <p className={styles.errorText}>{saveError}</p>}
          <button
            type="button"
            className={styles.saveButton}
            disabled={(hasRecurring && !amount) || saving}
            onClick={handleSave}
          >
            {saving ? strings.goalDetail.saving : strings.goalDetail.save}
          </button>
        </div>
      )}
    </div>
  );
}
