'use client';

import { useState } from 'react';
import { X, Check, ChevronRight, Tag, Wallet, ArrowRight, Percent } from 'lucide-react';
import { useLogic } from '@/src/logic/createTransactionTemplate/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import type { TransactionTemplateType } from '@/src/shared/firestore/types';
import styles from './CreateTransactionTemplateScreen.module.css';

const TYPE_LABEL: Record<TransactionTemplateType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  savings: 'Savings',
};

export function CreateTransactionTemplateScreen({ templateId }: { templateId?: string }) {
  const strings = useStrings();
  const {
    isEditing,
    name,
    setName,
    type,
    setType,
    types,
    savingsMode,
    setSavingsMode,
    isTransferLike,
    isTransfer,
    categoryId,
    setCategoryId,
    categoryOptions,
    description,
    setDescription,
    amountString,
    setAmountString,
    chargesString,
    setChargesString,
    accountId,
    setAccountId,
    toAccountId,
    setToAccountId,
    accounts,
    spendableAccounts,
    canSave,
    saving,
    saveError,
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
  } = useLogic(templateId);

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [toAccountPickerOpen, setToAccountPickerOpen] = useState(false);

  const accountChoices = type === 'expense' ? spendableAccounts : accounts;
  const selectedCategory = categoryOptions.find((option) => option.id === categoryId) ?? null;
  const selectedAccount = accounts.find((account) => account.id === accountId) ?? null;
  const selectedToAccount = accounts.find((account) => account.id === toAccountId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} onClick={goBack} aria-label={strings.common.back}>
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.headerTitle}>
          {isEditing ? strings.transactionTemplates.editTitle : strings.transactionTemplates.createTitle}
        </h1>
        <button
          type="button"
          className={`${styles.saveIconButton} ${canSave ? styles.saveIconButtonActive : ''}`}
          disabled={!canSave || saving}
          onClick={handleSave}
          aria-label={strings.common.save}
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
      </header>

      <ScreenState loading={loading} error={error} />

      {notFound && <p className={styles.errorText}>{strings.transactionTemplates.notFound}</p>}

      {!loading && !error && !notFound && (
        <div className={styles.form}>
          <div className={styles.card}>
            <input
              className={styles.titleInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.transactionTemplates.nameLabel}
            />
            <div className={styles.cardDivider} />
            <input
              className={styles.amountInput}
              inputMode="numeric"
              value={amountString}
              onChange={(event) => setAmountString(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={strings.transactionTemplates.amountPlaceholder}
            />
            <div className={styles.cardDivider} />
            <textarea
              className={styles.notesInput}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.transactionTemplates.descriptionLabel}
            />
          </div>

          <div className={styles.chipGroup}>
            {types.map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.chip} ${type === option ? styles.chipActive : ''}`}
                onClick={() => setType(option)}
              >
                {TYPE_LABEL[option]}
              </button>
            ))}
          </div>

          {type === 'savings' && (
            <div className={styles.chipGroup}>
              {(['moved', 'frozen'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${styles.chip} ${savingsMode === mode ? styles.chipActive : ''}`}
                  onClick={() => setSavingsMode(mode)}
                >
                  {mode === 'moved' ? strings.transactionTemplates.savingsModeMoved : strings.transactionTemplates.savingsModeFrozen}
                </button>
              ))}
            </div>
          )}

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setCategoryPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Tag size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>
                {isTransferLike ? strings.transactionTemplates.kindLabel : strings.transactionTemplates.categoryLabel}
              </span>
              <span className={styles.listRowValue}>{selectedCategory ? selectedCategory.name : '—'}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {categoryPickerOpen && (
              <div className={styles.expandPanel}>
                {categoryOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.optionRow} ${categoryId === option.id ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setCategoryId(option.id);
                      setCategoryPickerOpen(false);
                    }}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setAccountPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Wallet size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>
                {isTransferLike ? strings.transactionTemplates.fromAccountLabel : strings.transactionTemplates.accountLabel}
              </span>
              <span className={styles.listRowValue}>{selectedAccount ? selectedAccount.name : '—'}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {accountPickerOpen && (
              <div className={styles.expandPanel}>
                {accountChoices.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.optionRow} ${accountId === account.id ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setAccountId(account.id);
                      setAccountPickerOpen(false);
                    }}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isTransferLike && (
            <div className={styles.listGroup}>
              <button type="button" className={styles.listRow} onClick={() => setToAccountPickerOpen((c) => !c)}>
                <span className={styles.listRowIcon}>
                  <ArrowRight size={16} strokeWidth={2} />
                </span>
                <span className={styles.listRowLabel}>{strings.transactionTemplates.toAccountLabel}</span>
                <span className={styles.listRowValue}>{selectedToAccount ? selectedToAccount.name : '—'}</span>
                <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
              </button>
              {toAccountPickerOpen && (
                <div className={styles.expandPanel}>
                  {accounts
                    .filter((account) => account.id !== accountId)
                    .map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        className={`${styles.optionRow} ${toAccountId === account.id ? styles.optionRowActive : ''}`}
                        onClick={() => {
                          setToAccountId(account.id);
                          setToAccountPickerOpen(false);
                        }}
                      >
                        {account.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {isTransfer && (
            <div className={styles.listGroup}>
              <div className={styles.listRow}>
                <span className={styles.listRowIcon}>
                  <Percent size={16} strokeWidth={2} />
                </span>
                <span className={styles.listRowLabel}>{strings.transactionTemplates.chargesLabel}</span>
                <input
                  className={styles.chargesInput}
                  inputMode="numeric"
                  value={chargesString}
                  onChange={(event) => setChargesString(event.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                />
              </div>
            </div>
          )}

          {saveError && <p className={styles.errorText}>{saveError}</p>}
        </div>
      )}

      {isEditing && !loading && !error && !notFound && (
        <div className={styles.dangerCard}>
          <p className={styles.dangerTitle}>{strings.transactionTemplates.dangerZoneTitle}</p>
          {deleteConfirmOpen ? null : (
            <button type="button" className={styles.deleteButton} onClick={openDeleteConfirm}>
              {strings.transactionTemplates.deleteCta}
            </button>
          )}
          {deleteError && <p className={styles.errorText}>{deleteError}</p>}
        </div>
      )}

      {deleteConfirmOpen && (
        <ConfirmDialog
          title={strings.transactionTemplates.deleteConfirmTitle}
          message={strings.transactionTemplates.deleteConfirmMessage}
          confirmLabel={deleting ? strings.transactionTemplates.deleting : strings.transactionTemplates.deleteCta}
          cancelLabel={strings.common.cancel}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}
