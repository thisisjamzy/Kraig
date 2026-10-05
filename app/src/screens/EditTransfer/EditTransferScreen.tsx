'use client';

// Edit transfer, on the form standard (FormFrame): Description, Amount |
// Date, From | To, Kind; More options: charges, basket item; Delete below.

import { useLogic } from '@/src/logic/editTransfer/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FieldCard, FieldRow, FormFrame, MoreOptions, SelectField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
import styles from './EditTransferScreen.module.css';

export function EditTransferScreen({ transferId }: { transferId: string }) {
  const strings = useStrings();
  const {
    description,
    setDescription,
    kind,
    setKind,
    kinds,
    bucketItemKey,
    setBucketItemKey,
    bucketItemOptions,
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

  const ready = !loading && !error && !notFound;
  const amount = Number(amountString) || 0;
  const fromName = accounts.find((a) => a.id === fromAccountId)?.name;
  const toName = accounts.find((a) => a.id === toAccountId)?.name;
  const charges = Number(chargesString) || 0;
  const impact =
    amount > 0 && fromName && toName && !sameAccount
      ? `Moves ${Math.round(amount).toLocaleString('en-US')} from ${fromName} to ${toName}${charges ? `; ${Math.round(charges).toLocaleString('en-US')} in charges counts as an expense` : ''}.`
      : null;
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <FormFrame
      title={strings.editTransfer.title}
      onClose={goBack}
      phoneHeader="bar"
      impact={ready ? impact : null}
      primary={ready ? { label: 'Save transfer', disabled: !canSave, busy: submitting } : null}
      onSubmit={handleSave}
      error={submitError}
      after={
        ready ? (
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
        ) : null
      }
    >
      <ScreenState loading={loading} error={error} />
      {notFound && <p className={styles.errorText}>{strings.editTransfer.notFound}</p>}
      {ready && (
        <>
          <FieldCard label={strings.editTransfer.descriptionLabel}>
            <input className={ff.input} value={description} onChange={(event) => setDescription(event.target.value)} />
          </FieldCard>
          <FieldRow>
            <FieldCard label={strings.editTransfer.amountLabel}>
              <input className={ff.input} inputMode="decimal" value={amountString} onChange={(event) => setAmountString(event.target.value.replace(/[^0-9.]/g, ''))} />
            </FieldCard>
            <FieldCard label={strings.editTransfer.dateLabel}>
              <input type="date" className={ff.input} value={dateValue} onChange={(event) => setDateValue(event.target.value)} />
            </FieldCard>
          </FieldRow>
          <FieldRow>
            <SelectField label={strings.editTransfer.fromAccountLabel} value={fromAccountId} onChange={setFromAccountId} options={accountOptions} />
            <SelectField
              label={strings.editTransfer.toAccountLabel}
              value={toAccountId}
              onChange={setToAccountId}
              options={accountOptions}
              error={sameAccount ? strings.editTransfer.sameAccountError : null}
            />
          </FieldRow>
          <SelectField label={strings.editTransfer.kindLabel} value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: k }))} />
          <MoreOptions defaultOpen={charges > 0 || Boolean(bucketItemKey)}>
            <FieldCard label={strings.editTransfer.chargesLabel}>
              <input className={ff.input} inputMode="decimal" value={chargesString} onChange={(event) => setChargesString(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
              <span className={ff.hint}>{strings.editTransfer.chargesHint}</span>
            </FieldCard>
            {(bucketItemOptions.length > 0 || bucketItemKey) && (
              <SelectField
                label={strings.editTransaction.bucketItemLabel}
                value={bucketItemKey}
                onChange={setBucketItemKey}
                options={bucketItemOptions.map((o) => ({ value: o.key, label: o.label }))}
                placeholder={strings.editTransaction.bucketItemNone}
              />
            )}
          </MoreOptions>
        </>
      )}
    </FormFrame>
  );
}
