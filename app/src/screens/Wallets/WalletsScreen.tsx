'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useLogic, formatAmount } from '@/src/logic/wallets/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './WalletsScreen.module.css';

export function WalletsScreen() {
  const strings = useStrings();
  const {
    wallets,
    total,
    archivedWallets,
    loading,
    archivedLoading,
    error,
    goBack,
    addOpen,
    setAddOpen,
    openAddWallet,
    newName,
    setNewName,
    newShortName,
    setNewShortName,
    newType,
    setNewType,
    newCurrency,
    setNewCurrency,
    newStartingBalance,
    setNewStartingBalance,
    accountTypes,
    currencyOptions,
    creating,
    createError,
    handleCreateWallet,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.wallets.title}</h1>
      </header>

      <p className={styles.totalCaption}>
        {formatAmount(total)} <span className={styles.totalCurrency}>{strings.wallets.totalAcrossWalletsSuffix}</span>
      </p>

      <ScreenState loading={loading} error={error} />

      <div className={styles.list}>
        {wallets.map((wallet) => (
          <Link key={wallet.id} href={`/wallets/${wallet.id}`} className={styles.row}>
            <span className={styles.dot} style={{ background: wallet.color }} />
            <span className={styles.name}>{wallet.name}</span>
            <span className={styles.amount}>
              {formatAmount(wallet.amount)} {wallet.currency}
            </span>
            <ChevronRight size={16} strokeWidth={2} className={styles.chevron} />
          </Link>
        ))}
      </div>

      <button type="button" className={styles.addWalletButton} onClick={openAddWallet}>
        <Plus size={18} strokeWidth={2.25} />
        {strings.wallets.addWallet}
      </button>

      {!archivedLoading && archivedWallets.length > 0 && (
        <div className={styles.archivedSection}>
          <p className={styles.archivedTitle}>{strings.wallets.archivedTitle}</p>
          <div className={styles.list}>
            {archivedWallets.map((wallet) => (
              <Link key={wallet.id} href={`/wallets/${wallet.id}/edit`} className={styles.row}>
                <span className={styles.name}>{wallet.name}</span>
                <ChevronRight size={16} strokeWidth={2} className={styles.chevron} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {addOpen && (
        <Modal title={strings.wallets.addWalletTitle} onClose={() => setAddOpen(false)}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-wallet-name">
              {strings.wallets.nameLabel}
            </label>
            <input
              id="new-wallet-name"
              className={styles.formInput}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={strings.wallets.namePlaceholder}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-wallet-short-name">
              {strings.wallets.shortNameLabel}
            </label>
            <input
              id="new-wallet-short-name"
              className={styles.formInput}
              value={newShortName}
              maxLength={5}
              onChange={(event) => setNewShortName(event.target.value.slice(0, 5))}
              placeholder={newName.trim().slice(0, 5) || strings.wallets.shortNamePlaceholder}
            />
            <p className={styles.formHint}>{strings.wallets.shortNameHint}</p>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-wallet-type">
              {strings.wallets.typeLabel}
            </label>
            <select
              id="new-wallet-type"
              className={styles.formInput}
              value={newType}
              onChange={(event) => setNewType(event.target.value as typeof newType)}
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-wallet-currency">
              {strings.wallets.currencyLabel}
            </label>
            <select
              id="new-wallet-currency"
              className={styles.formInput}
              value={newCurrency}
              onChange={(event) => setNewCurrency(event.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} — {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-wallet-balance">
              {strings.wallets.startingBalanceLabel}
            </label>
            <input
              id="new-wallet-balance"
              className={styles.formInput}
              inputMode="numeric"
              value={newStartingBalance}
              onChange={(event) => setNewStartingBalance(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </div>

          {createError && (
            <p className={styles.errorText} role="alert">
              {createError}
            </p>
          )}

          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!newName.trim() || creating}
            onClick={handleCreateWallet}
          >
            {strings.common.save}
          </button>
        </Modal>
      )}
    </div>
  );
}
