'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/editTransfer/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './EditTransferScreen.module.css';

export function EditTransferScreen({ transferId }: { transferId: string }) {
  const strings = useStrings();
  const {
    description,
    setDescription,
    kind,
    setKind,
    kinds,
    amountString,
    setAmountString,
    chargesString,
    setChargesString,
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    accounts,
    dateValue,
    setDateValue,
    sameAccount,
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
  } = useLogic(transferId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.editTransfer.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.editTransfer.title}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {notFound && <p className={styles.errorText}>{strings.editTransfer.notFound}</p>}

      {!loading && !error && !notFound && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-description">
              {strings.editTransfer.descriptionLabel}
            </label>
            <input
              id="edit-transfer-description"
              className={styles.formInput}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-kind">
              {strings.editTransfer.kindLabel}
            </label>
            <select
              id="edit-transfer-kind"
              className={styles.formInput}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {kinds.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-amount">
              {strings.editTransfer.amountLabel}
            </label>
            <input
              id="edit-transfer-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={amountString}
              onChange={(event) => setAmountString(event.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-charges">
              {strings.editTransfer.chargesLabel}
            </label>
            <p className={styles.hintText}>{strings.editTransfer.chargesHint}</p>
            <input
              id="edit-transfer-charges"
              className={styles.formInput}
              inputMode="numeric"
              value={chargesString}
              onChange={(event) => setChargesString(event.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-from">
              {strings.editTransfer.fromAccountLabel}
            </label>
            <select
              id="edit-transfer-from"
              className={styles.formInput}
              value={fromAccountId}
              onChange={(event) => setFromAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-to">
              {strings.editTransfer.toAccountLabel}
            </label>
            <select
              id="edit-transfer-to"
              className={styles.formInput}
              value={toAccountId}
              onChange={(event) => setToAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {sameAccount && <p className={styles.errorText}>{strings.editTransfer.sameAccountError}</p>}

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-transfer-date">
              {strings.editTransfer.dateLabel}
            </label>
            <input
              id="edit-transfer-date"
              type="date"
              className={styles.formInput}
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          </div>

          {submitError && <p className={styles.errorText}>{submitError}</p>}

          <button type="button" className={styles.saveButton} disabled={!canSave} onClick={handleSave}>
            {submitting ? strings.editTransfer.saving : strings.common.save}
          </button>
        </div>
      )}

      {!loading && !error && !notFound && (
        <div className={styles.dangerCard}>
          <p className={styles.dangerTitle}>{strings.editTransfer.dangerZoneTitle}</p>

          {deleteConfirmOpen ? (
            <>
              <p className={styles.deleteConfirmPrompt}>{strings.editTransfer.deleteConfirmPrompt}</p>
              {deleteError && <p className={styles.errorText}>{deleteError}</p>}
              <div className={styles.deleteActions}>
                <button type="button" className={styles.cancelButton} onClick={cancelDelete} disabled={deleting}>
                  {strings.editTransfer.deleteCancel}
                </button>
                <button type="button" className={styles.deleteButton} onClick={confirmDelete} disabled={deleting}>
                  {deleting ? strings.editTransfer.deleting : strings.editTransfer.deleteConfirm}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.sectionCaption}>{strings.editTransfer.deleteHint}</p>
              <button type="button" className={styles.deleteButton} onClick={openDeleteConfirm}>
                {strings.editTransfer.deleteButton}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
