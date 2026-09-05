'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/backfillSpread/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import styles from './BackfillSpreadScreen.module.css';

export function BackfillSpreadScreen() {
  const strings = useStrings();
  const s = strings.backfill;
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
    startMonth,
    setStartMonth,
    endMonth,
    setEndMonth,
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

          <div className={styles.pickerRow}>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="backfill-start">
                {s.fromMonthLabel}
              </label>
              <input
                id="backfill-start"
                type="month"
                className={styles.formInput}
                value={startMonth}
                onChange={(event) => setStartMonth(event.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="backfill-end">
                {s.toMonthLabel}
              </label>
              <input
                id="backfill-end"
                type="month"
                className={styles.formInput}
                value={endMonth}
                onChange={(event) => setEndMonth(event.target.value)}
              />
            </div>
          </div>

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
