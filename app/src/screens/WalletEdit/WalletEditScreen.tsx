'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/walletEdit/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.walletDetail.editWalletTitle}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && wallet && (
        <>
          <div className={styles.form}>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="wallet-name">
                {strings.walletDetail.nameLabel}
              </label>
              <input
                id="wallet-name"
                className={styles.formInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="wallet-short-name">
                {strings.wallets.shortNameLabel}
              </label>
              <input
                id="wallet-short-name"
                className={styles.formInput}
                value={shortName}
                maxLength={5}
                onChange={(event) => setShortName(event.target.value.slice(0, 5))}
                placeholder={strings.wallets.shortNamePlaceholder}
              />
              <p className={styles.sectionCaption}>{strings.wallets.shortNameHint}</p>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="wallet-starting-balance">
                {strings.walletDetail.startingBalanceLabel}
              </label>
              <input
                id="wallet-starting-balance"
                className={styles.formInput}
                inputMode="numeric"
                value={startingBalance}
                onChange={(event) => setStartingBalance(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
              />
              <p className={styles.sectionCaption}>{strings.walletDetail.startingBalanceHint}</p>
            </div>
            <div className={styles.formField}>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={notSpendable} onChange={(event) => setNotSpendable(event.target.checked)} />
                {strings.walletDetail.notSpendableLabel}
              </label>
              <p className={styles.sectionCaption}>{strings.walletDetail.notSpendableHint}</p>
            </div>
            <div className={styles.formField}>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={frozen} onChange={(event) => setFrozen(event.target.checked)} />
                {strings.walletDetail.frozenLabel}
              </label>
              <p className={styles.sectionCaption}>{strings.walletDetail.frozenHint}</p>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="wallet-locked-amount">
                {strings.walletDetail.lockedAmountLabel}
              </label>
              <input
                id="wallet-locked-amount"
                className={styles.formInput}
                inputMode="numeric"
                value={lockedAmount}
                onChange={(event) => setLockedAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
              />
              <p className={styles.sectionCaption}>{strings.walletDetail.lockedAmountHint}</p>
            </div>

            {saveError && <p className={styles.errorText}>{saveError}</p>}
            <button type="button" className={styles.saveButton} disabled={!name.trim() || saving} onClick={handleSave}>
              {strings.common.save}
            </button>
          </div>

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
        </>
      )}
    </div>
  );
}
