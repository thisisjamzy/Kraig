'use client';

import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { Select, ListBox } from '@heroui/react';
import { useLogic, formatAmount, type TimeRange } from '@/src/logic/categoryTransactions/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './CategoryTransactionsScreen.module.css';

const TIME_RANGES: TimeRange[] = ['week', 'month', 'quarter', 'year', 'all'];

export function CategoryTransactionsScreen({ categoryId }: { categoryId: string }) {
  const strings = useStrings();
  const {
    transactions,
    categoryName,
    categoryArchived,
    summary,
    timeRange,
    setTimeRange,
    chart,
    currency,
    addTransactionHref,
    loading,
    error,
    editHref,
    goBack,
  } = useLogic(categoryId);

  const timeRangeLabel: Record<TimeRange, string> = {
    week: strings.transactionHistory.timeRangeWeek,
    month: strings.transactionHistory.timeRangeMonth,
    quarter: strings.transactionHistory.timeRangeQuarter,
    year: strings.transactionHistory.timeRangeYear,
    all: strings.transactionHistory.timeRangeAll,
  };

  const chartMax = Math.max(1, ...chart.map((entry) => Math.max(entry.budgeted, entry.spent)));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>
          {categoryName}
          {categoryArchived && <span className={styles.archivedBadge}>Archived</span>}
        </h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && summary && (
        <div className={styles.summaryCard}>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Budgeted</span>
              <span className={styles.summaryValue}>
                {formatAmount(summary.budgeted)} {currency}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Spent</span>
              <span className={styles.summaryValue}>
                {formatAmount(summary.spent)} {currency}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Remaining</span>
              <span className={summary.remaining < 0 ? styles.summaryValueDanger : styles.summaryValue}>
                {formatAmount(summary.remaining)} {currency}
              </span>
            </div>
          </div>
          <div className={styles.summaryTrack}>
            <div
              className={summary.spent > summary.budgeted ? styles.summaryFillOver : styles.summaryFill}
              style={{ width: `${summary.budgeted > 0 ? Math.min(100, Math.round((summary.spent / summary.budgeted) * 100)) : 0}%` }}
            />
          </div>
        </div>
      )}

      {!loading && !error && chart.length > 0 && (
        <div className={styles.trendCard}>
          <div className={styles.trendHeader}>
            <span className={styles.trendTitle}>{strings.transactionHistory.trendTitle}</span>
            <div className={styles.trendLegend}>
              <span className={styles.trendLegendItem}>
                <span className={`${styles.trendSwatch} ${styles.trendSwatchBudgeted}`} />
                {strings.transactionHistory.trendBudgetedLabel}
              </span>
              <span className={styles.trendLegendItem}>
                <span className={`${styles.trendSwatch} ${styles.trendSwatchSpent}`} />
                {strings.transactionHistory.trendSpentLabel}
              </span>
            </div>
          </div>
          <div className={styles.trendChart}>
            {chart.map((entry) => (
              <div
                key={entry.monthStr}
                className={styles.trendColumn}
                title={`${entry.label}: ${formatAmount(entry.budgeted)} budgeted, ${formatAmount(entry.spent)} spent (${currency})`}
              >
                <div className={styles.trendBars}>
                  <div
                    className={styles.trendBar}
                    style={{ height: `${Math.max(2, Math.round((entry.budgeted / chartMax) * 100))}%` }}
                  />
                  <div
                    className={`${styles.trendBar} ${
                      entry.budgeted > 0 && entry.spent > entry.budgeted ? styles.trendBarSpentOver : styles.trendBarSpent
                    }`}
                    style={{ height: `${Math.max(2, Math.round((entry.spent / chartMax) * 100))}%` }}
                  />
                </div>
                <span className={styles.trendMonthLabel}>{entry.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>{strings.transactionHistory.recordsTitle}</h2>
          <div className={styles.sectionActions}>
            <Select
              selectedKey={timeRange}
              onSelectionChange={(key) => key && setTimeRange(key as TimeRange)}
              aria-label={strings.transactionHistory.timeRangeFilterLabel}
            >
              <Select.Trigger className={styles.timeRangeTrigger}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {TIME_RANGES.map((range) => (
                    <ListBox.Item key={range} id={range} textValue={timeRangeLabel[range]}>
                      {timeRangeLabel[range]}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Link href={addTransactionHref} className={styles.addIconButton} aria-label="Add transaction">
              <Plus size={16} strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && transactions.length === 0 && (
        <p className={styles.emptyText}>{strings.transactionHistory.noTransactions}</p>
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
