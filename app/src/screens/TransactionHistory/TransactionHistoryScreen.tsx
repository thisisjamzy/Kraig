'use client';

import { ChevronLeft, Search, SlidersHorizontal, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useLogic, formatAmount } from '@/src/logic/transactionHistory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './TransactionHistoryScreen.module.css';

export function TransactionHistoryScreen() {
  const strings = useStrings();
  const { transactions, filterCategoryName, loading, error, editHref, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{filterCategoryName ?? strings.transactionHistory.title}</h1>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconButton} aria-label="Search">
            <Search size={18} strokeWidth={1.75} />
          </button>
          <button type="button" className={styles.iconButton} aria-label="Filter">
            <SlidersHorizontal size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <ScreenState loading={loading} error={error} />

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
              <Link href={editHref(transaction.id)} className={styles.editButton} aria-label="Edit transaction">
                <Pencil size={14} strokeWidth={1.75} />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
