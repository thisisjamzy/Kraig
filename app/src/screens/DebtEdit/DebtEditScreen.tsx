'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/debtEdit/useLogic';
import { DEBT_PRIORITIES } from '@/src/logic/createDebt/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './DebtEditScreen.module.css';

export function DebtEditScreen({ debtId }: { debtId: string }) {
  const strings = useStrings();
  const {
    debt,
    name,
    setName,
    description,
    setDescription,
    accounts,
    accountId,
    setAccountId,
    canBackfillAccount,
    principal,
    setPrincipal,
    priority,
    setPriority,
    startDate,
    setStartDate,
    notes,
    setNotes,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
    error,
  } = useLogic(debtId);

  const priorityLabel = (p: (typeof DEBT_PRIORITIES)[number]) =>
    strings.goals[p === 'high' ? 'priorityHigh' : p === 'medium' ? 'priorityMedium' : 'priorityLow'];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.debtDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.debtDetail.editDebt}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && debt && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-debt-name">
              {strings.createDebt.nameLabel}
            </label>
            <input
              id="edit-debt-name"
              className={styles.formInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-debt-description">
              {strings.createDebt.descriptionLabel}
            </label>
            <textarea
              id="edit-debt-description"
              className={styles.formTextarea}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {canBackfillAccount && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="edit-debt-account">
                {strings.createDebt.walletLabel}
              </label>
              <select
                id="edit-debt-account"
                className={styles.formInput}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">{strings.createDebt.noWalletOption}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              {accountId && <p className={styles.hintText}>{strings.createDebt.walletBackfillHint}</p>}
            </div>
          )}

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-debt-principal">
              {strings.createDebt.principalLabel}
            </label>
            <input
              id="edit-debt-principal"
              className={styles.formInput}
              inputMode="numeric"
              value={principal}
              onChange={(event) => setPrincipal(event.target.value.replace(/[^0-9.]/g, ''))}
            />
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
            <label className={styles.formLabel} htmlFor="edit-debt-start-date">
              {strings.createDebt.startDateLabel}
            </label>
            <input
              id="edit-debt-start-date"
              type="date"
              className={styles.formInput}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-debt-notes">
              {strings.createDebt.notesLabel}
            </label>
            <textarea
              id="edit-debt-notes"
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
            disabled={!name.trim() || !principal || saving}
            onClick={handleSave}
          >
            {saving ? strings.debtDetail.savingChanges : strings.debtDetail.saveChanges}
          </button>
        </div>
      )}
    </div>
  );
}
