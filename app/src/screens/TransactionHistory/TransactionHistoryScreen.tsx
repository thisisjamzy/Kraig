'use client';

import { ChevronLeft, Search, SlidersHorizontal, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useLogic, formatAmount, TYPE_FILTERS, type TransactionTypeFilter } from '@/src/logic/transactionHistory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './TransactionHistoryScreen.module.css';

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
  } = useLogic();

  const title = monthLabel ?? strings.transactionHistory.title;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
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
          return (
            <div key={transaction.id} className={styles.card}>
              <span className={styles.icon} style={{ background: transaction.iconColor }}>
                <Icon size={18} strokeWidth={2} color="#ffffff" />
              </span>
              <div className={styles.info}>
                <p className={styles.transactionTitle}>{transaction.title}</p>
                <p className={styles.description}>{transaction.description}</p>
                <p className={styles.account}>{transaction.account}</p>
                <div className={styles.amountRow}>
                  <span className={styles.amount}>
                    {formatAmount(transaction.amount)} {transaction.currency}
                  </span>
                  <span className={styles.date}>{transaction.date}</span>
                </div>
              </div>
              {transaction.kind === 'transaction' && (
                <Link href={editHref(transaction.id)} className={styles.editButton} aria-label="Edit transaction">
                  <Pencil size={14} strokeWidth={1.75} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
