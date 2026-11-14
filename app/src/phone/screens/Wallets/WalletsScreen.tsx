'use client';

// Wallets on a phone (BASELINE): the total at the top, each wallet with
// its color dot and balance, and "Add wallet" as the header's "+".

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { WalletCard, type WalletTone } from '@/src/widgets/Money/WalletCard';

const CYCLE: WalletTone[] = ['purple', 'ink', 'lilac'];
import { useLogic, formatAmount } from '@/src/logic/wallets/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from '@/src/phone/screens/Wallets/WalletsScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

export function WalletsScreen() {
  const formLink = useFormLink();
  const strings = useStrings();
  const {
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
    rows,
    totals,
    currency,
  } = useLogic();
  const active = rows.filter((r) => r.status === 'Active');
  const plainIndex = new Map(active.filter((r) => r.group !== 'Savings').map((r, i) => [r.id, i]));

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.wallets.title}
        right={
          <button type="button" className={styles.backButton} onClick={openAddWallet} aria-label={strings.wallets.addWallet}>
            <Plus size={18} strokeWidth={2.25} />
          </button>
        }
      />

      <ScreenState loading={loading} error={error} />

      {!loading && (
        <section className={styles.totalCard} aria-label="Total balance">
          <span className={styles.totalDecor} aria-hidden />
          <span className={styles.totalLabel}>Total balance · {active.length} {active.length === 1 ? 'wallet' : 'wallets'}</span>
          <p className={styles.totalValue}>
            {formatAmount(totals.total)} <span>{currency}</span>
          </p>
          <div className={styles.totalStats}>
            <div>
              <span>In savings</span>
              <strong>{formatAmount(totals.inSavings)}</strong>
            </div>
            <div>
              <span>Free after commitments</span>
              <strong>{formatAmount(totals.free)}</strong>
            </div>
          </div>
        </section>
      )}

      {!loading && (
        <>
          <p className={styles.sectionTitle}>Your wallets</p>
          <div className={styles.cardRow}>
            {active.map((r) => (
              <Link key={r.id} href={`/wallets/${r.id}`} className={styles.cardLink} aria-label={`${r.name}, ${formatAmount(r.balance)} ${currency}`}>
                <WalletCard
                  tone={r.group === 'Savings' ? 'lime' : CYCLE[(plainIndex.get(r.id) ?? 0) % CYCLE.length]}
                  type={r.type}
                  name={r.name}
                  last4={r.id.slice(-4).toUpperCase()}
                  currency={currency}
                  available={formatAmount(r.balance)}
                  required={r.committed > 0.5 ? formatAmount(r.committed) : '*****'}
                />
              </Link>
            ))}
          </div>
        </>
      )}

      {!archivedLoading && archivedWallets.length > 0 && (
        <div className={styles.archivedSection}>
          <p className={styles.archivedTitle}>{strings.wallets.archivedTitle}</p>
          <div className={styles.list}>
            {archivedWallets.map((wallet) => (
              <Link key={wallet.id} href={formLink('wallet', { id: wallet.id })} className={styles.row}>
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
                  {option.code}, {option.name}
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
