'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Layers } from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { useLogic, formatAmount } from '@/src/logic/budget/useLogic';
import { BucketItemMonthSheet } from '@/src/screens/BucketItemMonth/BucketItemMonthSheet';
import type { ItemMonth } from '@/src/shared/budget/monthBudget';
import { CATEGORY_ICON_COLOR } from '@/src/viewmodels/categories';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './BudgetScreen.module.css';
import webStyles from './BudgetScreen.web.module.css';
import groupStyles from './BudgetGroups.module.css';
// The month transactions panel uses this exact same card component style as
// the all-transactions list, so it reuses that module's classes directly
// rather than duplicating them.
import cardStyles from '@/src/screens/TransactionHistory/TransactionHistoryScreen.module.css';

export function BudgetScreen() {
  const strings = useStrings();
  const router = useRouter();
  const isWeb = useIsWeb();
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
    currency,
    currencyOptions,
    setCurrency,
    planHref,
    monthStr,
    budget,
    view,
    setView,
    openItem,
    setOpenItemKey,
    transactionsById,
    transfersById,
    buckets,
    itemsByBucket,
    allocations,
    needsAttention,
    leftovers,
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
          <span className={styles.totalLabel}>{strings.budget.plannedSpendingLabel}</span>
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
          {formatAmount(budget.plannedOutflow)} {currency}
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
          <Link href={planHref} className={styles.addBudgetButton}>
            <Layers size={16} strokeWidth={2.25} />
            {strings.budget.planInBuckets}
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

      {(needsAttention.length > 0 || leftovers.length > 0) && (
        <section className={`${groupStyles.attention} ${isWeb ? webStyles.areaAttention : ''}`}>
          <div className={groupStyles.attentionHeader}>
            <h2 className={groupStyles.attentionTitle}>{strings.budget.attentionTitle}</h2>
            <span className={groupStyles.attentionCount}>{needsAttention.length + leftovers.length}</span>
          </div>
          <div className={`${groupStyles.attentionRail} ${isWeb ? webStyles.attentionRailWeb : ''}`}>
            {needsAttention.map((entry) => (
              <button key={entry.key} type="button" className={groupStyles.attentionCard} onClick={() => setOpenItemKey(entry.key)}>
                <span className={groupStyles.attentionLabel}>{strings.budget.overspentBy}</span>
                <span className={groupStyles.attentionAmount}>{formatAmount(entry.unfunded)}</span>
                <span className={groupStyles.attentionName}>{entry.name}</span>
                <span className={groupStyles.attentionCta}>
                  {strings.budget.coverAction}
                  <ArrowRight size={12} strokeWidth={2.5} />
                </span>
              </button>
            ))}
            {leftovers.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={groupStyles.attentionCard}
                data-tone="leftover"
                onClick={() => setOpenItemKey(entry.key)}
              >
                <span className={groupStyles.attentionLabel}>{strings.budget.leftoverLabel}</span>
                <span className={groupStyles.attentionAmount}>{formatAmount(entry.remaining)}</span>
                <span className={groupStyles.attentionName}>{entry.name}</span>
                <span className={groupStyles.attentionCta}>
                  {strings.budget.reallocateAction}
                  <ArrowRight size={12} strokeWidth={2.5} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={`${styles.sectionTitleRow} ${isWeb ? webStyles.areaCatsHead : ''}`}>
        <h2 className={styles.sectionTitle}>{strings.budget.sectionTitle}</h2>
        <div className={groupStyles.viewToggle} role="group" aria-label={strings.budget.sectionTitle}>
          <button
            type="button"
            className={groupStyles.viewToggleButton}
            aria-pressed={view === 'category'}
            onClick={() => setView('category')}
          >
            {strings.budget.byCategory}
          </button>
          <button
            type="button"
            className={groupStyles.viewToggleButton}
            aria-pressed={view === 'bucket'}
            onClick={() => setView('bucket')}
          >
            {strings.budget.byBucket}
          </button>
        </div>
      </div>

      <ScreenState loading={loading} error={error} />

      {!loading && budget.categories.length === 0 ? (
        <p className={`${styles.emptyText} ${isWeb ? webStyles.areaCats : ''}`}>
          {strings.budget.noItemsPrefix} {monthLabel} {strings.budget.noItemsSuffix}
        </p>
      ) : (
        <div className={`${groupStyles.groups} ${isWeb ? webStyles.areaGroups : ''}`}>
          {view === 'category'
            ? budget.categories.map((group) => (
                <section key={group.categoryId} className={groupStyles.group}>
                  <GroupHeader
                    name={group.name}
                    type={group.type}
                    itemCount={group.items.length}
                    actual={group.actual}
                    available={group.available}
                    currency={currency}
                  />
                  {group.items.map((entry) => (
                    <ItemRow key={entry.key} entry={entry} subtitle={entry.bucketName} currency={currency} onOpen={setOpenItemKey} />
                  ))}
                  {group.unplanned !== 0 && (
                    <button type="button" className={groupStyles.unplannedRow} onClick={() => goToCategory(group.categoryId)}>
                      <span className={groupStyles.unplannedText}>
                        <span className={groupStyles.unplannedTitle}>{strings.budget.unplannedLabel}</span>
                        <span className={groupStyles.unplannedHint}>{strings.budget.unplannedRowHint}</span>
                      </span>
                      <span className={groupStyles.unplannedAmount}>{formatAmount(group.unplanned)}</span>
                    </button>
                  )}
                </section>
              ))
            : budget.buckets.map((group) => (
                <section key={group.bucketId} className={groupStyles.group}>
                  <GroupHeader
                    name={group.name}
                    itemCount={group.items.length}
                    actual={group.actual}
                    available={group.available}
                    currency={currency}
                  />
                  {group.items.map((entry) => (
                    <ItemRow key={entry.key} entry={entry} subtitle={entry.categoryName} currency={currency} onOpen={setOpenItemKey} />
                  ))}
                </section>
              ))}
        </div>
      )}

      {openItem && (
        <BucketItemMonthSheet
          entry={openItem}
          month={monthStr}
          budget={budget}
          transactionsById={transactionsById}
          transfersById={transfersById}
          buckets={buckets}
          itemsByBucket={itemsByBucket}
          allocations={allocations}
          onClose={() => setOpenItemKey(null)}
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

// Share of `available` that `actual` fills, for the meters below — an
// overspend (or anything spent against nothing planned) reads as full.
function fillPercent(actual: number, available: number) {
  if (available <= 0) return actual > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, (actual / available) * 100));
}

function GroupHeader({
  name,
  type,
  itemCount,
  actual,
  available,
  currency,
}: {
  name: string;
  type?: string;
  itemCount: number;
  actual: number;
  available: number;
  currency: string;
}) {
  const strings = useStrings();
  const isIncome = type === 'Income';
  const remaining = available - actual;
  const over = !isIncome && remaining < 0;
  const typeLabel = type ? strings.budget.typeLabels[type as keyof typeof strings.budget.typeLabels] ?? type : null;
  return (
    <div className={groupStyles.groupHeader}>
      <div className={groupStyles.groupTitleRow}>
        <div className={groupStyles.groupName}>
          <h3 className={groupStyles.groupNameText}>{name}</h3>
          <span className={groupStyles.groupMeta}>
            {type && <span className={groupStyles.typeDot} data-type={type} aria-hidden />}
            {typeLabel && <span>{typeLabel} ·</span>}
            <span>
              {itemCount} {itemCount === 1 ? strings.budget.itemSingular : strings.budget.itemPlural}
            </span>
          </span>
        </div>
        <div className={groupStyles.groupRemaining}>
          <span className={groupStyles.groupRemainingValue} data-status={over ? 'over' : 'ok'}>
            {formatAmount(Math.abs(isIncome ? actual : remaining))}
          </span>
          <span className={groupStyles.groupRemainingLabel}>
            {isIncome
              ? strings.budget.receivedLabel
              : over
                ? strings.budget.overLabel.toLowerCase()
                : `${currency} ${strings.budget.remainingLabel.toLowerCase()}`}
          </span>
        </div>
      </div>
      <div className={groupStyles.bar} aria-hidden>
        <div
          className={groupStyles.barFill}
          data-status={isIncome ? 'income' : over ? 'over' : 'ok'}
          style={{ width: `${fillPercent(actual, available)}%` }}
        />
      </div>
      <p className={groupStyles.groupSpent}>
        <strong>{formatAmount(actual)}</strong> {strings.budget.ofLabel} {formatAmount(available)} {currency}
      </p>
    </div>
  );
}

function ItemRow({
  entry,
  subtitle,
  currency,
  onOpen,
}: {
  entry: ItemMonth;
  subtitle: string;
  currency: string;
  onOpen: (key: string) => void;
}) {
  const strings = useStrings();
  const isIncome = entry.type === 'Income';
  const over = !isIncome && entry.remaining < 0;
  const done = !isIncome && entry.remaining === 0 && entry.actual > 0;
  const headline = isIncome
    ? `${formatAmount(entry.actual)} ${strings.budget.receivedLabel}`
    : over
      ? `${formatAmount(-entry.remaining)} ${strings.budget.overLabel.toLowerCase()}`
      : done
        ? strings.budget.statusLabels.on
        : `${formatAmount(entry.remaining)} ${strings.budget.remainingLabel.toLowerCase()}`;
  return (
    <button
      type="button"
      className={groupStyles.itemRow}
      onClick={() => onOpen(entry.key)}
      aria-label={`${entry.name}: ${headline}`}
    >
      <span className={groupStyles.itemTop}>
        <span className={groupStyles.itemMain}>
          <span className={groupStyles.itemName}>{entry.name}</span>
          <span className={groupStyles.itemMeta}>
            <span className={groupStyles.kindTag}>
              {entry.kind === 'Fixed' ? strings.budget.fixedBadge : strings.budget.plannedBadge}
            </span>
            {entry.isOverride && <span className={groupStyles.overrideTag}>{strings.budget.overrideBadge}</span>}
            <span>{subtitle}</span>
          </span>
        </span>
        <span className={groupStyles.itemFigures}>
          <span className={groupStyles.itemRemaining} data-status={over ? 'over' : done ? 'done' : 'ok'}>
            {headline}
          </span>
          <span className={groupStyles.itemOf}>
            {formatAmount(entry.actual)} / {formatAmount(entry.available)} {currency}
          </span>
        </span>
      </span>
      <span className={`${groupStyles.bar} ${groupStyles.barThin}`} aria-hidden>
        <span
          className={groupStyles.barFill}
          data-status={isIncome ? 'income' : over ? 'over' : 'ok'}
          style={{ display: 'block', width: `${fillPercent(entry.actual, entry.available)}%` }}
        />
      </span>
    </button>
  );
}
