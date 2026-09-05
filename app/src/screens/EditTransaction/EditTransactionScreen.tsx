'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/editTransaction/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './EditTransactionScreen.module.css';

export function EditTransactionScreen({ transactionId }: { transactionId: string }) {
  const strings = useStrings();
  const {
    description,
    setDescription,
    type,
    setType,
    types,
    categoryId,
    setCategoryId,
    categories,
    amountString,
    setAmountString,
    accountId,
    setAccountId,
    accounts,
    dateValue,
    setDateValue,
    canSave,
    submitting,
    submitError,
    handleSave,
    goBack,
    loading,
    error,
    notFound,

    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    deleting,
    deleteError,
  } = useLogic(transactionId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.editTransaction.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.editTransaction.title}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {notFound && <p className={styles.errorText}>{strings.editTransaction.notFound}</p>}

      {!loading && !error && !notFound && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transaction-description">
              {strings.editTransaction.descriptionLabel}
            </label>
            <input
              id="edit-transaction-description"
              className={styles.formInput}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transaction-type">
              {strings.editTransaction.typeLabel}
            </label>
            <select
              id="edit-transaction-type"
              className={styles.formInput}
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              {types.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transaction-category">
              {strings.editTransaction.categoryLabel}
            </label>
            <select
              id="edit-transaction-category"
              className={styles.formInput}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="" disabled>
                {strings.editTransaction.categoryPlaceholder}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transaction-amount">
              {strings.editTransaction.amountLabel}
            </label>
            <input
              id="edit-transaction-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={amountString}
              onChange={(event) => setAmountString(event.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transaction-account">
              {strings.editTransaction.accountLabel}
            </label>
            <select
              id="edit-transaction-account"
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
            <label className={styles.formLabel} htmlFor="edit-transaction-date">
              {strings.editTransaction.dateLabel}
            </label>
            <input
              id="edit-transaction-date"
              type="date"
              className={styles.formInput}
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          </div>

          {submitError && <p className={styles.errorText}>{submitError}</p>}

          <button type="button" className={styles.saveButton} disabled={!canSave} onClick={handleSave}>
            {submitting ? strings.editTransaction.saving : strings.common.save}
          </button>
        </div>
      )}

      {!loading && !error && !notFound && (
        <div className={styles.dangerCard}>
          <p className={styles.dangerTitle}>{strings.editTransaction.dangerZoneTitle}</p>

          {deleteConfirmOpen ? (
            <>
              <p className={styles.deleteConfirmPrompt}>{strings.editTransaction.deleteConfirmPrompt}</p>
              {deleteError && <p className={styles.errorText}>{deleteError}</p>}
              <div className={styles.deleteActions}>
                <button type="button" className={styles.cancelButton} onClick={cancelDelete} disabled={deleting}>
                  {strings.editTransaction.deleteCancel}
                </button>
                <button type="button" className={styles.deleteButton} onClick={confirmDelete} disabled={deleting}>
                  {deleting ? strings.editTransaction.deleting : strings.editTransaction.deleteConfirm}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.sectionCaption}>{strings.editTransaction.deleteHint}</p>
              <button type="button" className={styles.deleteButton} onClick={openDeleteConfirm}>
                {strings.editTransaction.deleteButton}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
