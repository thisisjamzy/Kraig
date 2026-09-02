'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/debtRepay/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './DebtRepayScreen.module.css';

export function DebtRepayScreen({ debtId }: { debtId: string }) {
  const strings = useStrings();
  const {
    debt,
    isCash,
    accounts,
    categories,
    amount,
    setAmount,
    date,
    setDate,
    notes,
    setNotes,
    linkAccount,
    setLinkAccount,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    useAccount,
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
        <h1 className={styles.title}>{strings.recordRepayment.title}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && debt && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="repayment-amount">
              {strings.recordRepayment.amountLabel}
            </label>
            <input
              id="repayment-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="repayment-date">
              {strings.recordRepayment.dateLabel}
            </label>
            <input
              id="repayment-date"
              type="date"
              className={styles.formInput}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="repayment-notes">
              {strings.recordRepayment.notesLabel}
            </label>
            <input
              id="repayment-notes"
              className={styles.formInput}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {!isCash && (
            <div className={styles.toggleRow}>
              <span>{strings.recordRepayment.linkWalletToggle}</span>
              <input type="checkbox" checked={linkAccount} onChange={(event) => setLinkAccount(event.target.checked)} />
            </div>
          )}

          {useAccount ? (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="repayment-account">
                  {strings.recordRepayment.accountLabel}
                </label>
                <select
                  id="repayment-account"
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
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="repayment-category">
                  {strings.recordRepayment.categoryLabel}
                </label>
                <select
                  id="repayment-category"
                  className={styles.formInput}
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className={styles.hintText}>
                {isCash ? strings.recordRepayment.cashHint : strings.recordRepayment.existingWithAccountHint}
              </p>
            </>
          ) : (
            <p className={styles.hintText}>{strings.recordRepayment.existingNoAccountHint}</p>
          )}

          {saveError && <p className={styles.errorText}>{saveError}</p>}
          <button
            type="button"
            className={styles.saveButton}
            disabled={!amount || (useAccount && !accountId) || saving}
            onClick={handleSave}
          >
            {saving ? strings.recordRepayment.saving : strings.recordRepayment.save}
          </button>
        </div>
      )}
    </div>
  );
}
