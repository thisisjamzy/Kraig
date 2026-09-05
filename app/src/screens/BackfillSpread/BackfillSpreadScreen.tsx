'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic, BACKFILL_FREQUENCIES } from '@/src/logic/backfillSpread/useLogic';
import type { BackfillFrequency } from '@/src/logic/backfillSpread/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import styles from './BackfillSpreadScreen.module.css';

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function BackfillSpreadScreen() {
  const strings = useStrings();
  const s = strings.backfill;

  const FREQUENCY_LABEL: Record<BackfillFrequency, string> = {
    once: s.frequencyOnce,
    daily: s.frequencyDaily,
    weekdays: s.frequencyWeekdays,
    weekly: s.frequencyWeekly,
    monthly: s.frequencyMonthly,
    quarterly: s.frequencyQuarterly,
  };

  const {
    title,
    setTitle,
    type,
    setType,
    categoryId,
    setCategoryId,
    categoriesForType,
    accountId,
    setAccountId,
    accounts,
    amountString,
    setAmountString,
    frequency,
    setFrequency,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    canExplainUnjustifiedBalance,
    explainsUnjustifiedBalance,
    setExplainsUnjustifiedBalance,
    unjustifiedBalance,
    currency,
    step,
    canPreview,
    handlePreview,
    previewError,
    occurrences,
    totalAmount,
    accountName,
    backToEdit,
    committing,
    commitError,
    handleConfirm,
    goBack,
    openBatches,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{step === 'preview' ? s.previewTitle : s.title}</h1>
      </header>

      {step === 'form' && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="backfill-title">
              {s.whatLabel}
            </label>
            <input
              id="backfill-title"
              className={styles.formInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={s.whatPlaceholder}
            />
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{s.typeLabel}</span>
            <div className={styles.typeTabs}>
              <button
                type="button"
                className={type === 'expense' ? `${styles.typeTab} ${styles.typeTabActive}` : styles.typeTab}
                onClick={() => setType('expense')}
              >
                Expense
              </button>
              <button
                type="button"
                className={type === 'income' ? `${styles.typeTab} ${styles.typeTabActive}` : styles.typeTab}
                onClick={() => setType('income')}
              >
                Income
              </button>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="backfill-amount">
              {s.amountLabel}
            </label>
            <input
              id="backfill-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={amountString}
              onChange={(event) => setAmountString(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="backfill-category">
              {s.categoryLabel}
            </label>
            <select id="backfill-category" className={styles.formInput} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="" disabled>
                {s.categoryPlaceholder}
              </option>
              {categoriesForType.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="backfill-account">
              {s.accountLabel}
            </label>
            <select id="backfill-account" className={styles.formInput} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="" disabled>
                {s.accountLabel}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{s.frequencyLabel}</span>
            <div className={styles.frequencyTabs}>
              {BACKFILL_FREQUENCIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={frequency === option ? `${styles.typeTab} ${styles.typeTabActive}` : styles.typeTab}
                  onClick={() => setFrequency(option)}
                >
                  {FREQUENCY_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          {frequency === 'once' ? (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="backfill-start">
                {s.onDateLabel}
              </label>
              <input
                id="backfill-start"
                type="date"
                className={styles.formInput}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
          ) : (
            <div className={styles.pickerRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="backfill-start">
                  {s.fromDateLabel}
                </label>
                <input
                  id="backfill-start"
                  type="date"
                  className={styles.formInput}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="backfill-end">
                  {s.toDateLabel}
                </label>
                <input
                  id="backfill-end"
                  type="date"
                  className={styles.formInput}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>
          )}

          {frequency === 'weekly' && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="backfill-weekday">
                {s.dayOfWeekLabel}
              </label>
              <select
                id="backfill-weekday"
                className={styles.formInput}
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(Number(event.target.value))}
              >
                {WEEKDAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(frequency === 'monthly' || frequency === 'quarterly') && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="backfill-day">
                {s.dayOfMonthLabel}
              </label>
              <select
                id="backfill-day"
                className={styles.formInput}
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(Number(event.target.value))}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          )}

          {canExplainUnjustifiedBalance && (
            <label className={styles.explainToggleRow}>
              <input
                type="checkbox"
                checked={explainsUnjustifiedBalance}
                onChange={(event) => setExplainsUnjustifiedBalance(event.target.checked)}
              />
              <span className={styles.explainToggleText}>
                <span className={styles.formLabel}>{s.explainToggleLabel}</span>
                <span className={styles.helperText}>
                  {s.explainToggleHint} {formatAmount(Math.abs(unjustifiedBalance))} {currency}
                </span>
              </span>
            </label>
          )}

          {previewError && <p className={styles.errorText}>{previewError}</p>}

          <button type="button" className={styles.primaryButton} disabled={!canPreview} onClick={handlePreview}>
            {s.previewButton}
          </button>

          <button type="button" className={styles.linkButton} onClick={openBatches}>
            {s.manageBatchesLink}
          </button>
        </div>
      )}

      {step === 'preview' && (
        <div className={styles.form}>
          <p className={styles.previewSummary}>
            {occurrences.length} {s.previewCountSuffix}
          </p>
          <div className={styles.occurrenceList}>
            {occurrences.map((occ, i) => (
              <div key={i} className={styles.occurrenceRow}>
                <span>{occ.date.toLocaleDateString()}</span>
                <span>{occ.title}</span>
                <span>
                  {type === 'income' ? '+' : '-'}
                  {formatAmount(occ.amount)} {currency}
                </span>
              </div>
            ))}
          </div>
          <p className={styles.previewTotal}>
            {s.previewTotalPrefix} {type === 'income' ? '+' : '-'}
            {formatAmount(totalAmount)} {currency} added to {accountName}&rsquo;s history
          </p>

          {commitError && <p className={styles.errorText}>{commitError}</p>}

          <div className={styles.previewActions}>
            <button type="button" className={styles.cancelButton} onClick={backToEdit} disabled={committing}>
              {s.backToEdit}
            </button>
            <button type="button" className={styles.primaryButton} onClick={handleConfirm} disabled={committing}>
              {committing ? s.committing : s.confirmButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
