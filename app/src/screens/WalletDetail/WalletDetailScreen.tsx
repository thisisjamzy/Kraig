'use client';

import { ChevronLeft, Settings } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useLogic, formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './WalletDetailScreen.module.css';

export function WalletDetailScreen({ walletId }: { walletId: string }) {
  const strings = useStrings();
  const {
    wallet,
    balance,
    lockedAmount,
    availableAmount,
    currency,
    transactions,
    period,
    setPeriod,
    loading,
    error,
    goBack,
    iconFor,
    editOpen,
    setEditOpen,
    openEdit,
    notSpendableDraft,
    setNotSpendableDraft,
    frozenDraft,
    setFrozenDraft,
    lockedAmountDraft,
    setLockedAmountDraft,
    savingEdit,
    editError,
    saveEdit,
  } = useLogic(walletId, strings.walletDetail.periods);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{wallet?.name ?? '…'}</h1>
        <button
          type="button"
          className={styles.editButton}
          onClick={openEdit}
          aria-label={strings.walletDetail.editWallet}
        >
          <Settings size={18} strokeWidth={1.75} />
        </button>
      </header>

      <p className={styles.balance}>
        {formatAmount(balance)} <span className={styles.balanceCurrency}>{currency}</span>
      </p>

      {lockedAmount > 0 && (
        <p className={styles.availableCaption}>
          {strings.walletDetail.availablePrefix} {formatAmount(availableAmount)} {currency}
        </p>
      )}

      {(wallet?.frozen || wallet?.notSpendable || lockedAmount > 0) && (
        <div className={styles.badgeRow}>
          {wallet?.frozen && <span className={styles.badgeFrozen}>{strings.walletDetail.frozenBadge}</span>}
          {wallet?.notSpendable && (
            <span className={styles.badgeNotSpendable}>{strings.walletDetail.notSpendableBadge}</span>
          )}
          {lockedAmount > 0 && (
            <span className={styles.badgeLocked}>
              {formatAmount(lockedAmount)} {currency} {strings.walletDetail.lockedBadgeSuffix}
            </span>
          )}
        </div>
      )}

      <ScreenState loading={loading} error={error} />

      <div className={styles.periodTabs}>
        {strings.walletDetail.periods.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.periodTab} ${period === option ? styles.periodTabActive : ''}`}
            onClick={() => setPeriod(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {transactions.map((transaction, index) => {
          const Icon = iconFor(index);
          return (
            <div key={transaction.id} className={styles.card}>
              <span className={styles.icon} style={{ background: transaction.iconColor }}>
                <Icon size={16} strokeWidth={2} color="#ffffff" />
              </span>
              <div className={styles.info}>
                <p className={styles.transactionTitle}>{transaction.title}</p>
                <p className={styles.date}>{transaction.date}</p>
              </div>
              <span className={styles.amount}>
                {formatAmount(transaction.amount)} {transaction.currency}
              </span>
            </div>
          );
        })}
      </div>

      {editOpen && (
        <Modal title={strings.walletDetail.editWalletTitle} onClose={() => setEditOpen(false)}>
          <div className={styles.formField}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={notSpendableDraft}
                onChange={(event) => setNotSpendableDraft(event.target.checked)}
              />
              {strings.walletDetail.notSpendableLabel}
            </label>
            <p className={styles.sectionCaption}>{strings.walletDetail.notSpendableHint}</p>
          </div>
          <div className={styles.formField}>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={frozenDraft} onChange={(event) => setFrozenDraft(event.target.checked)} />
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
              value={lockedAmountDraft}
              onChange={(event) => setLockedAmountDraft(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
            <p className={styles.sectionCaption}>{strings.walletDetail.lockedAmountHint}</p>
          </div>
          {editError && (
            <p className={styles.errorText} role="alert">
              {editError}
            </p>
          )}
          <button type="button" className={styles.modalSaveButton} disabled={savingEdit} onClick={saveEdit}>
            {strings.common.save}
          </button>
        </Modal>
      )}
    </div>
  );
}
