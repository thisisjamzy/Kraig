'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Pencil, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { useLogic, formatAmount } from '@/src/logic/budget/useLogic';
import { CATEGORY_ICON_COLOR } from '@/src/viewmodels/categories';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './BudgetScreen.module.css';
import webStyles from './BudgetScreen.web.module.css';
// The month transactions panel uses this exact same card component style as
// the all-transactions list, so it reuses that module's classes directly
// rather than duplicating them.
import cardStyles from '@/src/screens/TransactionHistory/TransactionHistoryScreen.module.css';

export function BudgetScreen() {
  const strings = useStrings();
  const router = useRouter();
  const isWeb = useIsWeb();
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
    actualSavingsThisMonth,
    cumulativeSavings,
    incomeVariance,
    expenseOverBudget,
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

  // A signed gap amount, not a raw total — always show the sign so "+120"
  // (received/spent more than planned) can't be misread as "120" (a plain
  // total). formatAmount already renders negative numbers with their own
  // "-", so only the positive case needs a prefix added.
  function formatSigned(value: number) {
    return value > 0 ? `+${formatAmount(value)}` : formatAmount(value);
  }

  // Nothing received yet this month is neutral — there's no judgment to
  // make yet. Received at least as much as planned is positive. Short of
  // the plan is negative.
  function incomeVarianceClass(variance: number, actual: number) {
    if (actual === 0) return styles.percentNeutral;
    return variance >= 0 ? styles.percentPositive : styles.percentNegative;
  }

  // Expenses read the opposite way — nothing spent yet is still neutral,
  // but staying at or under budget is the good outcome here and going over
  // it is the bad one.
  function expenseVarianceClass(overBudget: number, spent: number) {
    if (spent === 0) return styles.percentNeutral;
    return overBudget > 0 ? styles.percentNegative : styles.percentPositive;
  }

  // One word, not the full "repeats for 3 more months" sentence the
  // category's own edit form still uses elsewhere — 'limited' and 'until'
  // are both still a monthly cadence underneath (just with an end
  // condition), so the badge only needs to say whether this recurs at all.
  function recurrenceBadgeLabel(recurrence: 'once' | 'monthly' | 'limited' | 'until') {
    return recurrence === 'once' ? strings.budget.recurrenceBadgeOnce : strings.budget.recurrenceBadgeMonthly;
  }

  function goToCategory(categoryId: string) {
    router.push(`/budget/category/${encodeURIComponent(categoryId)}?month=${monthIndex}&year=${year}`);
  }

  return (
    <div className={`${styles.page} ${isWeb ? webStyles.page : ''}`}>
      <header className={`${styles.header} ${isWeb ? webStyles.areaHeader : ''}`}>
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

      <div className={`${styles.totalCard} ${isWeb ? webStyles.areaTotal : ''}`}>
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

        <div className={styles.totalCardBottomRow}>
          <div className={styles.leftToBudget}>
            <span className={styles.leftToBudgetLabel}>
              {isOverspending ? strings.budget.plannedOverspend : strings.budget.leftToBudget}
            </span>
            <span className={isOverspending ? styles.leftToBudgetValueWarning : styles.leftToBudgetValue}>
              {formatAmount(isOverspending ? overspendAmount : leftToBudget)} {currency}
            </span>
          </div>
          <Link href={addBudgetCategoryHref} className={styles.addBudgetButton} aria-label={strings.budget.addBudget}>
            <Plus size={18} strokeWidth={2.5} />
            {strings.budget.addBudget}
          </Link>
        </div>
      </div>

      <div className={`${styles.trackingTable} ${isWeb ? webStyles.areaTracking : ''}`}>
        <span className={styles.trackingCorner} />
        <span className={styles.trackingTableHeaderLabel}>{strings.budget.projectedColumnLabel}</span>
        <span className={styles.trackingTableHeaderLabel}>{strings.budget.actualColumnLabel}</span>
        <span className={styles.trackingCorner} />

        <span className={styles.trackingRowLabel}>{strings.budget.incomeRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(plannedIncome)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(actualIncome)}</span>
        <span className={`${styles.trackingPercentBadge} ${incomeVarianceClass(incomeVariance, actualIncome)}`}>
          {formatSigned(incomeVariance)}
        </span>

        <div className={styles.trackingTableDivider} />

        <span className={styles.trackingRowLabel}>{strings.budget.savingsRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(plannedSavings)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(actualSavingsThisMonth)}</span>
        <span className={styles.trackingCumulativeBadge}>
          {strings.budget.savingsCumulativeLabel} {formatAmount(cumulativeSavings)}
        </span>

        <div className={styles.trackingTableDivider} />

        <span className={styles.trackingRowLabel}>{strings.budget.expenseRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(totalExpenseBudgeted)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(totalExpenseSpent)}</span>
        <span className={`${styles.trackingPercentBadge} ${expenseVarianceClass(expenseOverBudget, totalExpenseSpent)}`}>
          {formatSigned(expenseOverBudget)}
        </span>
      </div>

      <div className={`${styles.sectionTitleRow} ${isWeb ? webStyles.areaCatsHead : ''}`}>
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
        <div className={`${styles.cardScroll} ${isWeb ? webStyles.areaCats : ''}`}>
          {categories.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className={`${styles.categoryCard} ${isWeb ? webStyles.categoryCardWeb : ''}`}
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
                <p className={styles.cardCategoryName}>{entry.category}</p>
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

              <div className={styles.cardBadgeRow}>
                <span className={styles.typeBadge} data-type={entry.type}>
                  {strings.budget.typeLabels[entry.type]}
                </span>
                <span className={styles.recurrenceBadge}>{recurrenceBadgeLabel(entry.recurrence)}</span>
              </div>

              <div className={styles.cardBudgetedBlock}>
                <span className={styles.cardBudgetedLabel}>{strings.budget.budgetedLabel}</span>
                <span className={styles.cardBudgetedAmount}>
                  {formatAmount(entry.budgeted)} {currency}
                </span>
              </div>

              <div className={styles.cardStatsRow}>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>{strings.budget.spentActionLabels[entry.type]}</span>
                  <span className={styles.cardStatValue}>{formatAmount(entry.spent)}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>{strings.budget.dedicatedLabel}</span>
                  <span className={styles.cardStatValue}>{formatAmount(entry.dedicated)}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>{strings.budget.unplannedLabel}</span>
                  <span className={styles.cardStatValue}>{formatAmount(entry.unplanned)}</span>
                </div>
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

      <div className={`${styles.sectionTitleRow} ${isWeb ? webStyles.areaTransHead : ''}`}>
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
      ) : isWeb ? (
        <div className={webStyles.areaTrans}>
          <div className={cardStyles.list}>
            {monthTransactions.map((transaction) => {
              const Icon = transaction.icon;
              return (
                <Link key={transaction.id} href={transaction.editHref} className={cardStyles.card}>
                  <span className={cardStyles.icon} style={{ background: transaction.iconColor }}>
                    <Icon size={20} strokeWidth={2} color={CATEGORY_ICON_COLOR} />
                  </span>
                  <div className={cardStyles.info}>
                    <p className={cardStyles.transactionTitle}>{transaction.title}</p>
                    <p className={cardStyles.description}>{transaction.description}</p>
                    <p className={cardStyles.account}>{transaction.account}</p>
                  </div>
                  <div className={cardStyles.amountRow}>
                    <span className={cardStyles.amount}>
                      {formatAmount(transaction.amount)} {transaction.currency}
                    </span>
                    <span className={cardStyles.date}>{transaction.date}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {monthTransactionCount > monthTransactions.length && (
            <Link href={viewAllMonthTransactionsHref} className={styles.viewAllLink}>
              {strings.budget.viewAllMonthTransactionsPrefix} {monthTransactionCount}{' '}
              {strings.budget.viewAllMonthTransactionsSuffix}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className={cardStyles.list}>
            {monthTransactions.map((transaction) => {
              const Icon = transaction.icon;
              return (
                <Link key={transaction.id} href={transaction.editHref} className={cardStyles.card}>
                  <span className={cardStyles.icon} style={{ background: transaction.iconColor }}>
                    <Icon size={20} strokeWidth={2} color={CATEGORY_ICON_COLOR} />
                  </span>
                  <div className={cardStyles.info}>
                    <p className={cardStyles.transactionTitle}>{transaction.title}</p>
                    <p className={cardStyles.description}>{transaction.description}</p>
                    <p className={cardStyles.account}>{transaction.account}</p>
                  </div>
                  <div className={cardStyles.amountRow}>
                    <span className={cardStyles.amount}>
                      {formatAmount(transaction.amount)} {transaction.currency}
                    </span>
                    <span className={cardStyles.date}>{transaction.date}</span>
                  </div>
                </Link>
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

      <p className={`${styles.footerNote} ${isWeb ? webStyles.areaFooter : ''}`}>{strings.budget.footerNote}</p>

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
