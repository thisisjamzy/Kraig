'use client';

import { useRef } from 'react';
import { ChevronLeft, Search, SlidersHorizontal, Pencil, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useLogic, formatAmount, TYPE_FILTERS, type TransactionTypeFilter } from '@/src/logic/transactionHistory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import styles from './TransactionHistoryScreen.module.css';

// How long a press must hold before it counts as "long" rather than a tap.
const LONG_PRESS_MS = 500;

export function TransactionHistoryScreen() {
  const strings = useStrings();
  const {
    transactions,
    isFiltered,
    monthLabel,
    isAllTransactionsView,
    loading,
    error,
    editHref,
    goBack,
    searchOpen,
    toggleSearch,
    searchQuery,
    setSearchQuery,
    filterOpen,
    toggleFilter,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    accounts,
    hasActiveFilters,
    clearFilters,

    selectionMode,
    selectedIds,
    enterSelectionMode,
    toggleSelected,
    confirmDeleteOpen,
    openConfirmDelete,
    cancelConfirmDelete,
    confirmDeleteSelected,
    deleting,
    deleteError,
  } = useLogic();

  const title = monthLabel ?? strings.transactionHistory.title;

  // Long-press detection: onPointerDown starts a timer; releasing/leaving
  // before it fires cancels it (a normal tap). Pointer events cover both
  // touch and mouse, so this works the same on the phone PWA and in a
  // desktop browser tab.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function startLongPress(id: string) {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      // Already selecting: a long press on another row adds it rather than
      // resetting the whole selection back down to just this one.
      if (selectionMode) toggleSelected(id);
      else enterSelectionMode(id);
    }, LONG_PRESS_MS);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleCardClick(id: string) {
    // The long press itself already entered selection mode and selected
    // this row — the pointerup/click that follows shouldn't then toggle it
    // straight back off.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (selectionMode) toggleSelected(id);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {selectionMode ? (
          <>
            <button type="button" className={styles.backButton} onClick={goBack} aria-label="Cancel selection">
              <X size={18} strokeWidth={2} />
            </button>
            <h1 className={styles.title}>{selectedIds.size} selected</h1>
          </>
        ) : (
          <>
            <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
            <h1 className={styles.title}>{title}</h1>
            {isAllTransactionsView && (
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={searchOpen ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton}
                  aria-label="Search"
                  aria-pressed={searchOpen}
                  onClick={toggleSearch}
                >
                  <Search size={18} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className={
                    filterOpen || hasActiveFilters ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton
                  }
                  aria-label="Filter"
                  aria-pressed={filterOpen}
                  onClick={toggleFilter}
                >
                  <SlidersHorizontal size={18} strokeWidth={1.75} />
                  {hasActiveFilters && <span className={styles.filterDot} />}
                </button>
              </div>
            )}
          </>
        )}
      </header>

      {searchOpen && (
        <div className={styles.searchRow}>
          <input
            type="text"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={strings.transactionHistory.searchPlaceholder}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearSearchButton}
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
            >
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {filterOpen && (
        <div className={styles.filterRow}>
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TransactionTypeFilter)}
            aria-label={strings.transactionHistory.filterTypeLabel}
          >
            {TYPE_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {filter === 'All' ? strings.transactionHistory.filterTypeAll : filter}
              </option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            aria-label={strings.transactionHistory.filterAccountLabel}
          >
            <option value="All">{strings.transactionHistory.filterAccountAll}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasActiveFilters && (
        <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>
          {strings.transactionHistory.clearFilters}
        </button>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && transactions.length === 0 && (
        <p className={styles.emptyText}>
          {isFiltered ? strings.transactionHistory.noMatches : strings.transactionHistory.noTransactions}
        </p>
      )}

      <div className={styles.list}>
        {transactions.map((transaction) => {
          const Icon = transaction.icon;
          const selected = selectedIds.has(transaction.id);
          return (
            <div
              key={transaction.id}
              className={selected ? `${styles.card} ${styles.cardSelected}` : styles.card}
              onPointerDown={() => startLongPress(transaction.id)}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onClick={() => handleCardClick(transaction.id)}
              onContextMenu={(event) => selectionMode && event.preventDefault()}
            >
              {selectionMode && (
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selected}
                  onChange={() => toggleSelected(transaction.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={selected ? 'Deselect transaction' : 'Select transaction'}
                />
              )}
              <span className={styles.icon} style={{ background: transaction.iconColor }}>
                <Icon size={18} strokeWidth={2} color="#ffffff" />
              </span>
              <div className={styles.info}>
                <p className={styles.transactionTitle}>
                  {transaction.title}
                  {transaction.origin === 'backfill' && <span className={styles.originTag}>{strings.transactionHistory.backfilledTag}</span>}
                  {transaction.origin === 'reconciliation' && (
                    <span className={styles.originTag}>{strings.transactionHistory.reconciliationTag}</span>
                  )}
                </p>
                <p className={styles.description}>{transaction.description}</p>
                <p className={styles.account}>{transaction.account}</p>
                <div className={styles.amountRow}>
                  <span className={styles.amount}>
                    {formatAmount(transaction.amount)} {transaction.currency}
                  </span>
                  <span className={styles.date}>{transaction.date}</span>
                </div>
              </div>
              {!selectionMode && transaction.kind === 'transaction' && (
                <Link href={editHref(transaction.id)} className={styles.editButton} aria-label="Edit transaction">
                  <Pencil size={14} strokeWidth={1.75} />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {selectionMode && (
        <div className={styles.selectionBar}>
          <button type="button" className={styles.deleteFab} disabled={selectedIds.size === 0} onClick={openConfirmDelete}>
            <Trash2 size={16} strokeWidth={2} />
            Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </div>
      )}

      {deleteError && <p className={styles.errorText}>{deleteError}</p>}

      {confirmDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? '' : 's'}?`}
          message="Their wallets' balances will be adjusted back to what they were before these entries. This can't be undone."
          confirmLabel={deleting ? 'Deleting…' : 'Delete'}
          cancelLabel="Cancel"
          onConfirm={confirmDeleteSelected}
          onCancel={cancelConfirmDelete}
        />
      )}
    </div>
  );
}
