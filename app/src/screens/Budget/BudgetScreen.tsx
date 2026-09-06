'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Pencil, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { useLogic, formatAmount } from '@/src/logic/budget/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './BudgetScreen.module.css';
// The month transactions panel uses this exact same card component style as
// the all-transactions list, so it reuses that module's classes directly
// rather than duplicating them.
import cardStyles from '@/src/screens/TransactionHistory/TransactionHistoryScreen.module.css';

export function BudgetScreen() {
  const strings = useStrings();
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const {
    monthIndex,
    year,
    daysLeftInMonth,
    retroTransactionHref,
    monthTransactions,
    monthTransactionsLoading,
    monthTransactionCount,
    viewAllMonthTransactionsHref,
    monthPickerOpen,
    setMonthPickerOpen,
    pickerYear,
    setPickerYear,
    categories,
    currency,
    currencyOptions,
    setCurrency,
    addBudgetCategoryHref,
    plannedIncome,
    plannedSavings,
    actualIncome,
    actualSavings,
    incomeProgressPercent,
    savingsProgressPercent,
    expenseProgressPercent,
    totalExpenseBudgeted,
    totalExpenseSpent,
    leftToBudget,
    overspendAmount,
    isOverspending,
    loading,
    error,
    openMonthPicker,
    chooseMonth,
    handleDelete,
  } = useLogic();

  const monthNames = strings.months;
  const monthLabel = `${monthNames[monthIndex]} ${year}`;

  // 0% (nothing logged yet) is neutral — there's no judgment to make yet.
  // 100%+ (target met or exceeded) is positive. Anything logged but still
  // short of the target is negative.
  function percentClass(percent: number) {
    if (percent === 0) return styles.percentNeutral;
    return percent >= 100 ? styles.percentPositive : styles.percentNegative;
  }

  // Expenses read the opposite way — 0% (nothing spent yet) is still
  // neutral, but staying under 100% of budget is the good outcome here and
  // crossing it (overspent) is the bad one.
  function expensePercentClass(percent: number) {
    if (percent === 0) return styles.percentNeutral;
    return percent > 100 ? styles.percentNegative : styles.percentPositive;
  }

  function recurrenceCaption(entry: {
    recurrence: 'once' | 'monthly' | 'limited' | 'until';
    recurrenceMonths?: number;
    endMonthIndex?: number;
    endYear?: number;
  }) {
    if (entry.recurrence === 'monthly') return strings.budget.recurrenceMonthly;
    if (entry.recurrence === 'limited') {
      const months = entry.recurrenceMonths ?? 1;
      const suffix =
        months === 1 ? strings.budget.recurrenceLimitedSuffixOne : strings.budget.recurrenceLimitedSuffixMany;
      return `${strings.budget.recurrenceLimitedPrefix} ${months} ${suffix}`;
    }
    if (entry.recurrence === 'until' && entry.endMonthIndex !== undefined && entry.endYear !== undefined) {
      return `${strings.budget.recurrenceMonthly} · ${strings.addBudgetCategory.endMonthLabel.toLowerCase()} ${monthNames[entry.endMonthIndex]} ${entry.endYear}`;
    }
    return strings.budget.recurrenceOnce;
  }

  function goToCategory(categoryId: string) {
    router.push(`/budget/category/${encodeURIComponent(categoryId)}?month=${monthIndex}&year=${year}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{monthLabel}</h1>
          {daysLeftInMonth !== null && (
            <p className={styles.subtitle}>
              {daysLeftInMonth > 0
                ? `${daysLeftInMonth} ${strings.budget.daysLeftInMonth} ${monthNames[monthIndex]}`
                : `${strings.budget.lastDayOfMonth} ${monthNames[monthIndex]}`}
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.dateButton}
          onClick={openMonthPicker}
          aria-label={strings.budget.changeMonth}
        >
          <CalendarDays size={20} strokeWidth={1.75} />
        </button>
      </header>

      <div className={styles.totalCard}>
        <div className={styles.totalCardTopRow}>
          <span className={styles.totalLabel}>{strings.budget.totalBudgetLabel}</span>
          <ActionMenu
            ariaLabel={strings.budget.switchCurrency}
            triggerClassName={styles.currencyBadge}
            triggerIcon={currency}
            items={currencyOptions.map((option) => ({
              key: option.code,
              label: `${option.code} — ${option.name}`,
              icon: option.code === currency ? <Check size={14} strokeWidth={2.5} /> : <span style={{ width: 14 }} />,
              onSelect: () => setCurrency(option.code),
            }))}
          />
        </div>
        <p className={styles.totalAmount}>
          {formatAmount(totalExpenseBudgeted)} {currency}
        </p>

        {isOverspending && (
          <p className={styles.overspendWarning}>
            {strings.budget.overspendWarningPrefix} {formatAmount(overspendAmount)} {currency}
          </p>
        )}

        <div className={styles.totalCardBottomRow}>
          <div className={styles.leftToBudget}>
            <span className={styles.leftToBudgetLabel}>{strings.budget.leftToBudget}</span>
            <span className={styles.leftToBudgetValue}>
              {formatAmount(leftToBudget)} {currency}
            </span>
          </div>
          <Link href={addBudgetCategoryHref} className={styles.addBudgetButton} aria-label={strings.budget.addBudget}>
            <Plus size={18} strokeWidth={2.5} />
            {strings.budget.addBudget}
          </Link>
        </div>
      </div>

      <div className={styles.trackingTable}>
        <span className={styles.trackingCorner} />
        <span className={styles.trackingTableHeaderLabel}>{strings.budget.projectedColumnLabel}</span>
        <span className={styles.trackingTableHeaderLabel}>{strings.budget.actualColumnLabel}</span>
        <span className={styles.trackingCorner} />

        <span className={styles.trackingRowLabel}>{strings.budget.incomeRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(plannedIncome)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(actualIncome)}</span>
        <span className={`${styles.trackingPercentBadge} ${percentClass(incomeProgressPercent)}`}>
          {incomeProgressPercent}%
        </span>

        <div className={styles.trackingTableDivider} />

        <span className={styles.trackingRowLabel}>{strings.budget.savingsRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(plannedSavings)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(actualSavings)}</span>
        <span className={`${styles.trackingPercentBadge} ${percentClass(savingsProgressPercent)}`}>
          {savingsProgressPercent}%
        </span>

        <div className={styles.trackingTableDivider} />

        <span className={styles.trackingRowLabel}>{strings.budget.expenseRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(totalExpenseBudgeted)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(totalExpenseSpent)}</span>
        <span className={`${styles.trackingPercentBadge} ${expensePercentClass(expenseProgressPercent)}`}>
          {expenseProgressPercent}%
        </span>
      </div>

      <div className={styles.sectionTitleRow}>
        <h2 className={styles.sectionTitle}>{strings.budget.sectionTitle}</h2>
        <Link href={addBudgetCategoryHref} className={styles.addIconButton} aria-label={strings.budget.addCategory}>
          <Plus size={16} strokeWidth={2.25} />
        </Link>
      </div>

      <ScreenState loading={loading} error={error} />

      {!loading && categories.length === 0 ? (
        <p className={styles.emptyText}>
          {strings.budget.noCategoriesPrefix} {monthLabel} {strings.budget.noCategoriesSuffix}
        </p>
      ) : (
        <div className={styles.cardScroll}>
          {categories.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className={styles.categoryCard}
              data-type={entry.type}
              onClick={() => goToCategory(entry.categoryId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToCategory(entry.categoryId);
                }
              }}
            >
              <div className={styles.cardTopRow}>
                <div className={styles.cardHeading}>
                  <p className={styles.cardCategoryName}>{entry.category}</p>
                  <p className={styles.cardFrequency}>{recurrenceCaption(entry)}</p>
                </div>
                <div className={styles.cardMenu} onClick={(event) => event.stopPropagation()}>
                  <ActionMenu
                    title={entry.category}
                    ariaLabel={`Actions for ${entry.category}`}
                    items={[
                      {
                        key: 'edit',
                        label: strings.budget.editAction,
                        icon: <Pencil size={16} strokeWidth={1.75} />,
                        onSelect: () =>
                          router.push(`/edit-budget-category/${entry.id}?month=${monthIndex}&year=${year}`),
                      },
                      {
                        key: 'delete',
                        label: strings.budget.deleteAction,
                        icon: <Trash2 size={16} strokeWidth={1.75} />,
                        onSelect: () => setConfirmDeleteId(entry.id),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              </div>
              <div className={styles.cardBottom}>
                <div className={styles.cardAmounts}>
                  <p className={styles.cardSpentLabel}>
                    {formatAmount(entry.spent)} {strings.budget.spentOfLabels[entry.type]}
                  </p>
                  <p className={styles.cardBudgetedAmount}>
                    {formatAmount(entry.budgeted)} {currency}
                  </p>
                </div>
                <span className={styles.typeBadge} data-type={entry.type}>
                  {strings.budget.typeLabels[entry.type]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title={strings.budget.deleteConfirmTitle}
          message={
            categories.find((c) => c.id === confirmDeleteId)?.recurrence !== 'once'
              ? strings.budget.deleteRecurringHint
              : strings.budget.deleteConfirmMessage
          }
          confirmLabel={strings.budget.deleteAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            handleDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <div className={styles.sectionTitleRow}>
        <h2 className={styles.sectionTitle}>{strings.budget.monthTransactionsTitle}</h2>
        <Link href={retroTransactionHref} className={styles.recordTransactionButton}>
          <Plus size={16} strokeWidth={2.25} />
          {strings.budget.recordTransaction}
        </Link>
      </div>

      {monthTransactionsLoading ? (
        <ScreenState loading />
      ) : monthTransactions.length === 0 ? (
        <p className={styles.emptyText}>
          {strings.budget.noMonthTransactionsPrefix} {monthLabel} {strings.budget.noMonthTransactionsSuffix}
        </p>
      ) : (
        <>
          <div className={cardStyles.list}>
            {monthTransactions.map((transaction) => {
              const Icon = transaction.icon;
              return (
                <div key={transaction.id} className={cardStyles.card}>
                  <span className={cardStyles.icon} style={{ background: transaction.iconColor }}>
                    <Icon size={18} strokeWidth={2} color="#ffffff" />
                  </span>
                  <div className={cardStyles.info}>
                    <p className={cardStyles.transactionTitle}>{transaction.title}</p>
                    <p className={cardStyles.description}>{transaction.description}</p>
                    <p className={cardStyles.account}>{transaction.account}</p>
                    <div className={cardStyles.amountRow}>
                      <span className={cardStyles.amount}>
                        {formatAmount(transaction.amount)} {transaction.currency}
                      </span>
                      <span className={cardStyles.date}>{transaction.date}</span>
                    </div>
                  </div>
                  <Link href={transaction.editHref} className={cardStyles.editButton} aria-label="Edit transaction">
                    <Pencil size={14} strokeWidth={1.75} />
                  </Link>
                </div>
              );
            })}
          </div>

          {monthTransactionCount > monthTransactions.length && (
            <Link href={viewAllMonthTransactionsHref} className={styles.viewAllLink}>
              {strings.budget.viewAllMonthTransactionsPrefix} {monthTransactionCount}{' '}
              {strings.budget.viewAllMonthTransactionsSuffix}
            </Link>
          )}
        </>
      )}

      <p className={styles.footerNote}>{strings.budget.footerNote}</p>

      {monthPickerOpen && (
        <Modal title={strings.budget.chooseMonth} onClose={() => setMonthPickerOpen(false)}>
          <div className={styles.yearStepper}>
            <button
              type="button"
              className={styles.yearStepButton}
              onClick={() => setPickerYear((value) => value - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className={styles.yearStepValue}>{pickerYear}</span>
            <button
              type="button"
              className={styles.yearStepButton}
              onClick={() => setPickerYear((value) => value + 1)}
              aria-label="Next year"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className={styles.monthGrid}>
            {monthNames.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`${styles.monthButton} ${
                  index === monthIndex && pickerYear === year ? styles.monthButtonActive : ''
                }`}
                onClick={() => chooseMonth(index)}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </Modal>
      )}

    </div>
  );
}
