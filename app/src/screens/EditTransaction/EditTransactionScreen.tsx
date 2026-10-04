'use client';

// Edit transaction, on the form standard (FormFrame): Description, Amount |
// Date, Type, Category, Basket item, Account; Impact; Delete under the button.

import { useLogic } from '@/src/logic/editTransaction/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FieldCard, FieldRow, FormFrame, SegmentedField, SelectField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
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
    bucketItemKey,
    setBucketItemKey,
    bucketItemOptions,
    amountString,
    setAmountString,
    accountId,
    setAccountId,
    accounts,
    spendableAccounts,
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

  const ready = !loading && !error && !notFound;
  const shownAccounts = type === 'Expense' ? spendableAccounts : accounts;
  const accountName = shownAccounts.find((a) => a.id === accountId)?.name;
  const amount = Number(amountString) || 0;
  const day = dateValue ? new Date(`${dateValue}T00:00:00`) : null;
  const impact =
    amount > 0 && accountName
      ? `${type === 'Income' ? 'Records' : 'Takes'} ${Math.round(amount).toLocaleString('en-US')} ${type === 'Income' ? 'into' : 'from'} ${accountName}${
          day ? ` on ${day.getDate()} ${day.toLocaleDateString('en-GB', { month: 'short' })}` : ''
        }.`
      : null;

  return (
    <FormFrame
      title={strings.editTransaction.title}
      onClose={goBack}
      phoneHeader="bar"
      impact={ready ? impact : null}
      primary={ready ? { label: 'Save transaction', disabled: !canSave, busy: submitting } : null}
      onSubmit={handleSave}
      error={submitError}
      after={
        ready ? (
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
        ) : null
      }
    >
      <ScreenState loading={loading} error={error} />
      {notFound && <p className={styles.errorText}>{strings.editTransaction.notFound}</p>}
      {ready && (
        <>
          <FieldCard label={strings.editTransaction.descriptionLabel}>
            <input className={ff.input} value={description} onChange={(event) => setDescription(event.target.value)} />
          </FieldCard>
          <FieldRow>
            <FieldCard label={strings.editTransaction.amountLabel}>
              <input className={ff.input} inputMode="decimal" value={amountString} onChange={(event) => setAmountString(event.target.value.replace(/[^0-9.]/g, ''))} />
            </FieldCard>
            <FieldCard label={strings.editTransaction.dateLabel}>
              <input type="date" className={ff.input} value={dateValue} onChange={(event) => setDateValue(event.target.value)} />
            </FieldCard>
          </FieldRow>
          <SegmentedField label={strings.editTransaction.typeLabel} value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t }))} />
          <SelectField
            label={strings.editTransaction.categoryLabel}
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={strings.editTransaction.categoryPlaceholder}
          />
          {(bucketItemOptions.length > 0 || bucketItemKey) && (
            <SelectField
              label={strings.editTransaction.bucketItemLabel}
              value={bucketItemKey}
              onChange={setBucketItemKey}
              options={bucketItemOptions.map((o) => ({ value: o.key, label: o.label }))}
              placeholder={strings.editTransaction.bucketItemNone}
            />
          )}
          {/* A Savings Account never funds a direct expense (useLogic's spendableAccounts). */}
          <SelectField label={strings.editTransaction.accountLabel} value={accountId} onChange={setAccountId} options={shownAccounts.map((a) => ({ value: a.id, label: a.name }))} />
        </>
      )}
    </FormFrame>
  );
}
