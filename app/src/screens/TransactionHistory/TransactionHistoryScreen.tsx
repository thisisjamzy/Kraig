'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronDown, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  useLogic,
  formatAmount,
  TYPE_FILTERS,
  GROUP_OPTIONS,
  type TransactionTypeFilter,
  type SortOption,
  type GroupOption,
} from '@/src/logic/transactionHistory/useLogic';
import { CATEGORY_ICON_COLOR } from '@/src/viewmodels/categories';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import styles from './TransactionHistoryScreen.module.css';

// How long a press must hold before it counts as "long" rather than a tap.
const LONG_PRESS_MS = 500;

export function TransactionHistoryScreen() {
  const strings = useStrings();
  const router = useRouter();
  const {
    transactions,
    groupedTransactions,
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
    setFilterOpen,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    categoryFilter,
    setCategoryFilter,
    dateFromValue,
    setDateFromValue,
    dateToValue,
    setDateToValue,
    categories,
    sortBy,
    setSortBy,
    groupBy,
    setGroupBy,
    collapsedGroupTitles,
    toggleGroupCollapsed,
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

  const GROUP_OPTION_LABEL: Record<GroupOption, string> = {
    none: strings.transactionHistory.groupByNone,
    category: strings.transactionHistory.groupByCategory,
    wallet: strings.transactionHistory.groupByWallet,
    type: strings.transactionHistory.groupByType,
  };

  // The filter popover is anchored to its own trigger button, not a
  // full-screen Modal — closes on an outside click/tap or Escape, same
  // convention as Home's currency popover and ActionMenu.
  const filterMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFilterOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [filterOpen, setFilterOpen]);

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
  function handleCardClick(transaction: (typeof transactions)[number]) {
    // The long press itself already entered selection mode and selected
    // this row — the pointerup/click that follows shouldn't then toggle it
    // straight back off.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (selectionMode) {
      toggleSelected(transaction.id);
      return;
    }
    router.push(editHref(transaction.id));
  }

  function renderRow(transaction: (typeof transactions)[number]) {
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
        onClick={() => handleCardClick(transaction)}
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
          <Icon size={20} strokeWidth={2} color={CATEGORY_ICON_COLOR} />
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
        </div>
        <div className={styles.amountRow}>
          <span className={styles.amount}>
            {formatAmount(transaction.amount)} {transaction.currency}
          </span>
          <span className={styles.date}>{transaction.date}</span>
        </div>
      </div>
    );
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
                <div className={styles.filterMenuWrap} ref={filterMenuRef}>
                  <button
                    type="button"
                    className={
                      filterOpen || hasActiveFilters ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton
                    }
                    aria-label="Filter"
                    aria-expanded={filterOpen}
                    onClick={toggleFilter}
                  >
                    <SlidersHorizontal size={18} strokeWidth={1.75} />
                    {hasActiveFilters && <span className={styles.filterDot} />}
                  </button>

                  {filterOpen && (
                    <div className={styles.filterPopover} onClick={(event) => event.stopPropagation()}>
                      <p className={styles.filterPopoverTitle}>{strings.transactionHistory.filterMenuTitle}</p>

                      <label className={styles.filterField}>
                        <span className={styles.filterFieldLabel}>{strings.transactionHistory.filterTypeLabel}</span>
                        <select
                          className={styles.filterSelect}
                          value={typeFilter}
                          onChange={(event) => setTypeFilter(event.target.value as TransactionTypeFilter)}
                        >
                          {TYPE_FILTERS.map((filter) => (
                            <option key={filter} value={filter}>
                              {filter === 'All' ? strings.transactionHistory.filterTypeAll : filter}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.filterField}>
                        <span className={styles.filterFieldLabel}>{strings.transactionHistory.filterAccountLabel}</span>
                        <select
                          className={styles.filterSelect}
                          value={accountFilter}
                          onChange={(event) => setAccountFilter(event.target.value)}
                        >
                          <option value="All">{strings.transactionHistory.filterAccountAll}</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.filterField}>
                        <span className={styles.filterFieldLabel}>{strings.transactionHistory.filterCategoryLabel}</span>
                        <select
                          className={styles.filterSelect}
                          value={categoryFilter}
                          onChange={(event) => setCategoryFilter(event.target.value)}
                        >
                          <option value="All">{strings.transactionHistory.filterCategoryAll}</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* The timeline selector gets its own full-width row —
                          two date inputs side by side under one shared
                          "Date range" label, rather than sharing a row with
                          the selects above. */}
                      <div className={styles.filterField}>
                        <span className={styles.filterFieldLabel}>{strings.transactionHistory.filterDateRangeLabel}</span>
                        <div className={styles.dateRangeRow}>
                          <input
                            type="date"
                            className={styles.filterDateInput}
                            value={dateFromValue}
                            max={dateToValue || undefined}
                            onChange={(event) => setDateFromValue(event.target.value)}
                            aria-label={strings.transactionHistory.filterDateFromLabel}
                          />
                          <span className={styles.dateRangeSeparator}>–</span>
                          <input
                            type="date"
                            className={styles.filterDateInput}
                            value={dateToValue}
                            min={dateFromValue || undefined}
                            onChange={(event) => setDateToValue(event.target.value)}
                            aria-label={strings.transactionHistory.filterDateToLabel}
                          />
                        </div>
                      </div>

                      <label className={styles.filterField}>
                        <span className={styles.filterFieldLabel}>{strings.transactionHistory.sortByLabel}</span>
                        <select
                          className={styles.filterSelect}
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value as SortOption)}
                        >
                          <option value="date">{strings.transactionHistory.sortByDate}</option>
                          <option value="category">{strings.transactionHistory.sortByCategory}</option>
                        </select>
                      </label>

                      <label className={styles.filterField}>
                        <span className={styles.filterFieldLabel}>{strings.transactionHistory.groupByLabel}</span>
                        <select
                          className={styles.filterSelect}
                          value={groupBy}
                          onChange={(event) => setGroupBy(event.target.value as GroupOption)}
                        >
                          {GROUP_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {GROUP_OPTION_LABEL[option]}
                            </option>
                          ))}
                        </select>
                      </label>

                      {hasActiveFilters && (
                        <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>
                          {strings.transactionHistory.clearFilters}
                        </button>
                      )}
                    </div>
                  )}
                </div>
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

      <ScreenState loading={loading} error={error} />

      {!loading && !error && transactions.length === 0 && (
        <p className={styles.emptyText}>
          {isFiltered ? strings.transactionHistory.noMatches : strings.transactionHistory.noTransactions}
        </p>
      )}

      {groupedTransactions ? (
        <div className={styles.groupedList}>
          {groupedTransactions.map((group) => {
            const collapsed = collapsedGroupTitles.has(group.title);
            return (
              <div key={group.title} className={styles.categoryGroup}>
                <button
                  type="button"
                  className={styles.categoryGroupHeader}
                  onClick={() => toggleGroupCollapsed(group.title)}
                  aria-expanded={!collapsed}
                >
                  <h2 className={styles.categoryGroupTitle}>
                    {group.title} <span className={styles.categoryGroupCount}>({group.rows.length})</span>
                  </h2>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className={collapsed ? styles.categoryGroupChevronCollapsed : styles.categoryGroupChevron}
                  />
                </button>
                {!collapsed && (
                  <div className={styles.list}>{group.rows.map((transaction) => renderRow(transaction))}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.list}>{transactions.map((transaction) => renderRow(transaction))}</div>
      )}

      {selectionMode ? (
        <div className={styles.selectionBar}>
          <button type="button" className={styles.deleteFab} disabled={selectedIds.size === 0} onClick={openConfirmDelete}>
            <Trash2 size={16} strokeWidth={2} />
            Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </div>
      ) : (
        <div className={styles.fabRow}>
          <Link href="/add-transaction" className={styles.fab} aria-label={strings.transactionHistory.addTransactionCta}>
            <Plus size={24} strokeWidth={2.25} />
          </Link>
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
