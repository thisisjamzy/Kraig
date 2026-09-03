'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic, DEBT_TYPES, DEBT_PRIORITIES, RECURRING_INTERVALS } from '@/src/logic/createDebt/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './CreateDebtScreen.module.css';

const INTERVAL_LABEL: Record<(typeof RECURRING_INTERVALS)[number], string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function CreateDebtScreen() {
  const strings = useStrings();
  const {
    debtType,
    setDebtType,
    accounts,
    accountId,
    setAccountId,
    needsAccount,
    name,
    setName,
    description,
    setDescription,
    principalAmount,
    setPrincipalAmount,
    currency,
    setCurrency,
    currencyOptions,
    priority,
    setPriority,
    startDate,
    setStartDate,
    notes,
    setNotes,
    hasRecurring,
    setHasRecurring,
    recurringAmount,
    setRecurringAmount,
    recurringInterval,
    setRecurringInterval,
    recurringNextDate,
    setRecurringNextDate,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
  } = useLogic();

  const typeLabel = (type: (typeof DEBT_TYPES)[number]) =>
    type === 'cash' ? strings.createDebt.typeCash : strings.createDebt.typeExisting;
  const priorityLabel = (p: (typeof DEBT_PRIORITIES)[number]) =>
    strings.goals[p === 'high' ? 'priorityHigh' : p === 'medium' ? 'priorityMedium' : 'priorityLow'];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.debtDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.createDebt.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.createDebt.typeLabel}</span>
            <div className={styles.recurrenceGroup}>
              {DEBT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`${styles.recurrenceOption} ${debtType === type ? styles.recurrenceOptionActive : ''}`}
                  onClick={() => setDebtType(type)}
                >
                  {typeLabel(type)}
                </button>
              ))}
            </div>
          </div>

          {needsAccount && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="debt-account">
                {strings.createDebt.walletLabel}
              </label>
              <select
                id="debt-account"
                className={styles.formInput}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <p className={styles.hintText}>{strings.createDebt.walletHint}</p>
            </div>
          )}

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="debt-name">
              {strings.createDebt.nameLabel}
            </label>
            <input
              id="debt-name"
              className={styles.formInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.createDebt.namePlaceholder}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="debt-description">
              {strings.createDebt.descriptionLabel}
            </label>
            <textarea
              id="debt-description"
              className={styles.formTextarea}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="debt-principal">
              {strings.createDebt.principalLabel}
            </label>
            <input
              id="debt-principal"
              className={styles.formInput}
              inputMode="numeric"
              value={principalAmount}
              onChange={(event) => setPrincipalAmount(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="debt-currency">
              {strings.createDebt.currencyLabel}
            </label>
            <select
              id="debt-currency"
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
            <span className={styles.formLabel}>{strings.createDebt.priorityLabel}</span>
            <div className={styles.recurrenceGroupRow}>
              {DEBT_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.recurrenceOption} ${priority === p ? styles.recurrenceOptionActive : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {priorityLabel(p)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="debt-start-date">
              {strings.createDebt.startDateLabel}
            </label>
            <input
              id="debt-start-date"
              type="date"
              className={styles.formInput}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className={styles.recurringToggleRow}>
            <span>{strings.createDebt.recurringToggle}</span>
            <input type="checkbox" checked={hasRecurring} onChange={(event) => setHasRecurring(event.target.checked)} />
          </div>

          {hasRecurring && (
            <div className={styles.recurringFields}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="debt-recurring-amount">
                  {strings.createDebt.recurringAmountLabel}
                </label>
                <input
                  id="debt-recurring-amount"
                  className={styles.formInput}
                  inputMode="numeric"
                  value={recurringAmount}
                  onChange={(event) => setRecurringAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                />
              </div>
              <div className={styles.formField}>
                <span className={styles.formLabel}>{strings.createDebt.recurringIntervalLabel}</span>
                <div className={styles.recurrenceGroupRow}>
                  {RECURRING_INTERVALS.map((interval) => (
                    <button
                      key={interval}
                      type="button"
                      className={`${styles.recurrenceOption} ${
                        recurringInterval === interval ? styles.recurrenceOptionActive : ''
                      }`}
                      onClick={() => setRecurringInterval(interval)}
                    >
                      {INTERVAL_LABEL[interval]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="debt-recurring-next-date">
                  {strings.createDebt.recurringNextDateLabel}
                </label>
                <input
                  id="debt-recurring-next-date"
                  type="date"
                  className={styles.formInput}
                  value={recurringNextDate}
                  onChange={(event) => setRecurringNextDate(event.target.value)}
                />
              </div>
            </div>
          )}

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="debt-notes">
              {strings.createDebt.notesLabel}
            </label>
            <textarea
              id="debt-notes"
              className={styles.formTextarea}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {saveError && <p className={styles.errorText}>{saveError}</p>}

          <button
            type="button"
            className={styles.saveButton}
            disabled={!name.trim() || !principalAmount || (needsAccount && !accountId) || saving}
            onClick={handleSave}
          >
            {saving ? strings.createDebt.saving : strings.createDebt.save}
          </button>
        </div>
      )}
    </div>
  );
}
