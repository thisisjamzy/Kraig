'use client';

// Edit wallet, on the form standard (FormFrame): Name | Short name, Type,
// Starting balance; More options: not spendable, frozen, locked amount.
// Archiving (with where its money goes) sits under the button.

import { useLogic } from '@/src/logic/walletEdit/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FieldCard, FieldRow, FormFrame, MoreOptions, SelectField, SwitchField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
import { SAVINGS_ACCOUNT_TYPE } from '@/src/viewmodels/wallets';
import styles from './WalletEditScreen.module.css';

export function WalletEditScreen({ walletId }: { walletId: string }) {
  const strings = useStrings();
  const {
    wallet,
    otherWallets,
    name,
    setName,
    shortName,
    setShortName,
    type,
    setType,
    accountTypes,
    startingBalance,
    setStartingBalance,
    notSpendable,
    setNotSpendable,
    frozen,
    setFrozen,
    lockedAmount,
    setLockedAmount,
    saving,
    saveError,
    handleSave,

    archiveOpen,
    setArchiveOpen,
    openArchive,
    archiveMode,
    setArchiveMode,
    transferDestinationId,
    setTransferDestinationId,
    archiving,
    archiveError,
    confirmArchive,
    unarchive,

    goBack,
    loading,
    error,
  } = useLogic(walletId);

  const ready = !loading && !error && wallet;
  return (
    <FormFrame
      title={strings.walletDetail.editWalletTitle}
      onClose={goBack}
      phoneHeader="bar"
      primary={ready ? { label: 'Save wallet', disabled: !name.trim(), busy: saving } : null}
      onSubmit={handleSave}
      error={saveError}
      after={
        ready && wallet ? (
      <div className={styles.dangerCard}>
        <p className={styles.dangerTitle}>{strings.walletDetail.dangerZoneTitle}</p>

        {wallet.archived ? (
          <>
            <span className={styles.archivedBadge}>{strings.walletDetail.archivedBadge}</span>
            <p className={styles.sectionCaption}>{strings.walletDetail.unarchiveWalletHint}</p>
            <button type="button" className={styles.unarchiveButton} onClick={unarchive}>
              {strings.walletDetail.unarchiveWallet}
            </button>
          </>
        ) : archiveOpen ? (
          <>
            {wallet.currentBalance > 0 && (
              <>
                <p className={styles.sectionCaption}>
                  {strings.walletDetail.availablePrefix} {formatAmount(wallet.currentBalance)} {wallet.currency}
                </p>
                <p className={styles.sectionCaption}>{strings.walletDetail.archiveFundsPrompt}</p>
                <div className={styles.radioGroup}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="archive-mode"
                      checked={archiveMode === 'transfer'}
                      onChange={() => setArchiveMode('transfer')}
                    />
                    {strings.walletDetail.archiveModeTransfer}
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="archive-mode"
                      checked={archiveMode === 'discard'}
                      onChange={() => setArchiveMode('discard')}
                    />
                    {strings.walletDetail.archiveModeDiscard}
                  </label>
                </div>
                {archiveMode === 'transfer' && (
                  <div className={styles.formField}>
                    <label className={styles.formLabel} htmlFor="archive-destination">
                      {strings.walletDetail.archiveDestinationLabel}
                    </label>
                    <select
                      id="archive-destination"
                      className={styles.formInput}
                      value={transferDestinationId}
                      onChange={(event) => setTransferDestinationId(event.target.value)}
                    >
                      {otherWallets.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {archiveError && <p className={styles.errorText}>{archiveError}</p>}
            <div className={styles.archiveActions}>
              <button type="button" className={styles.cancelButton} onClick={() => setArchiveOpen(false)}>
                {strings.walletDetail.archiveCancel}
              </button>
              <button
                type="button"
                className={styles.archiveButton}
                disabled={archiving || (wallet.currentBalance > 0 && archiveMode === 'transfer' && otherWallets.length === 0)}
                onClick={confirmArchive}
              >
                {archiving ? strings.walletDetail.archiving : strings.walletDetail.archiveConfirm}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.sectionCaption}>{strings.walletDetail.archiveWalletHint}</p>
            <button type="button" className={styles.archiveButton} onClick={openArchive}>
              {strings.walletDetail.archiveWallet}
            </button>
          </>
        )}
      </div>
        ) : null
      }
    >
      <ScreenState loading={loading} error={error} />
      {ready && (
        <>
          <FieldRow>
            <FieldCard label={strings.walletDetail.nameLabel}>
              <input className={ff.input} value={name} onChange={(event) => setName(event.target.value)} />
            </FieldCard>
            <FieldCard label={strings.wallets.shortNameLabel}>
              <input
                className={ff.input}
                value={shortName}
                maxLength={5}
                onChange={(event) => setShortName(event.target.value.slice(0, 5))}
                placeholder={strings.wallets.shortNamePlaceholder}
              />
            </FieldCard>
          </FieldRow>
          <SelectField label={strings.wallets.typeLabel} value={type} onChange={setType} options={accountTypes.map((t) => ({ value: t, label: t }))} />
          {type === SAVINGS_ACCOUNT_TYPE && <p className={styles.sectionCaption}>{strings.walletDetail.savingsAccountTypeHint}</p>}
          <FieldCard label={strings.walletDetail.startingBalanceLabel}>
            <input
              className={ff.input}
              inputMode="decimal"
              value={startingBalance}
              onChange={(event) => setStartingBalance(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
            <span className={ff.hint}>{strings.walletDetail.startingBalanceHint}</span>
          </FieldCard>
          <MoreOptions defaultOpen={notSpendable || frozen || Boolean(Number(lockedAmount))}>
            <SwitchField label={strings.walletDetail.notSpendableLabel} description={strings.walletDetail.notSpendableHint} checked={notSpendable} onChange={setNotSpendable} />
            <SwitchField label={strings.walletDetail.frozenLabel} description={strings.walletDetail.frozenHint} checked={frozen} onChange={setFrozen} />
            <FieldCard label={strings.walletDetail.lockedAmountLabel}>
              <input
                className={ff.input}
                inputMode="decimal"
                value={lockedAmount}
                onChange={(event) => setLockedAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
              />
              <span className={ff.hint}>{strings.walletDetail.lockedAmountHint}</span>
            </FieldCard>
          </MoreOptions>
        </>
      )}
    </FormFrame>
  );
}
