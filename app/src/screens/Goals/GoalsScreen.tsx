'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat,
  Search,
  Shuffle,
  X,
} from 'lucide-react';
import { useLogic, type GoalKindFilter, type DedicatedBucketKey } from '@/src/logic/goals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { GoalsHeader } from '@/src/widgets/GoalsHeader/GoalsHeader';
import { Modal } from '@/src/widgets/Modal/Modal';
import { goalIconTint, goalInitial } from '@/src/viewmodels/goalIcons';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './GoalsScreen.module.css';
import webStyles from './GoalsScreen.web.module.css';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

// Search only pays for itself once there's actually something to search
// through — below this, scanning a short list by eye is faster than typing.
const SEARCH_ENABLED_ABOVE = 20;

export function GoalsScreen() {
  const router = useRouter();
  const strings = useStrings();
  const isWeb = useIsWeb();
  const {
    currency,
    goals,
    allGoalsCount,
    kindFilter,
    setKindFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    toggleSearch,
    range,
    setRange,
    monthIndex,
    year,
    pickerYear,
    setPickerYear,
    monthPickerOpen,
    setMonthPickerOpen,
    openMonthPicker,
    chooseMonth,
    dedicatedTotals,
    openBucketKey,
    openBucketModal,
    closeBucketModal,
    openBucketItems,
    loading,
    error,
  } = useLogic();

  const monthNames = strings.months;
  const monthLabel = `${monthNames[monthIndex].slice(0, 3)} ${year}`;

  // The hero card's own Expense/Income toggle — Expense compares dedicated
  // spend against this month's Expense budget; Income compares dedicated
  // income against this month's projected (budgeted) income. Purely a
  // display choice, doesn't affect the cards row below at all.
  const [heroMode, setHeroMode] = useState<'expense' | 'income'>('expense');

  const kindFilters: { key: GoalKindFilter; label: string }[] = [
    { key: 'All', label: strings.goals.filterAll },
    { key: 'Fixed', label: strings.goals.filterFixed },
    { key: 'Variable', label: strings.goals.filterVariable },
  ];

  // The dashboard card labels reused as the drill-down modal's own title —
  // GoalsScreen.web.module.css/mobile classes already own the card copy
  // itself, this just maps each bucket key back to the same string.
  const bucketLabel: Record<DedicatedBucketKey, string> = {
    fixedExpense: strings.goals.fixedExpenseLabel,
    variableExpense: strings.goals.variableExpenseLabel,
    fixedIncome: strings.goals.fixedIncomeLabel,
    variableIncome: strings.goals.variableIncomeLabel,
    fixedSavings: strings.goals.fixedSavingsLabel,
    variableSavings: strings.goals.variableSavingsLabel,
    transfers: strings.goals.transfersEstimatedCostLabel,
  };

  const hasSearch = searchQuery.trim().length > 0;
  const searchEnabled = allGoalsCount > SEARCH_ENABLED_ABOVE;

  const typeBadgeLabel: Record<'Expense' | 'Income' | 'Savings' | 'Transfer', string> = {
    Expense: strings.goals.typeBadgeExpense,
    Income: strings.goals.typeBadgeIncome,
    Savings: strings.goals.typeBadgeSavings,
    Transfer: strings.goals.typeBadgeTransfer,
  };
  const typeBadgeClass: Record<'Expense' | 'Income' | 'Savings' | 'Transfer', string> = {
    Expense: styles.typeBadgeExpense,
    Income: styles.typeBadgeIncome,
    Savings: styles.typeBadgeSavings,
    Transfer: styles.typeBadgeTransfer,
  };

  return (
    <div className={`${styles.page} ${isWeb ? webStyles.page : ''}`}>
      <GoalsHeader range={range} onChangeRange={setRange} />

      {/* The month/date picker's own row — deliberately not in GoalsHeader
          (that's this mini-app's shared "app bar", used by all three tabs)
          and not floating on top of the hero card either; its own row in
          the page's normal content flow, only shown in "month" mode. */}
      {range === 'month' && (
        <div className={styles.dateRow}>
          <button type="button" className={styles.dateButton} onClick={openMonthPicker} aria-label={strings.goals.changeMonthLabel}>
            <CalendarDays size={14} strokeWidth={2} />
            {monthLabel}
          </button>
        </div>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          <div className={styles.heroCard}>
            <div className={styles.heroToggle}>
              <button
                type="button"
                className={`${styles.heroToggleSegment} ${heroMode === 'expense' ? styles.heroToggleSegmentActive : ''}`}
                onClick={() => setHeroMode('expense')}
              >
                {strings.goals.heroToggleExpense}
              </button>
              <button
                type="button"
                className={`${styles.heroToggleSegment} ${heroMode === 'income' ? styles.heroToggleSegmentActive : ''}`}
                onClick={() => setHeroMode('income')}
              >
                {strings.goals.heroToggleIncome}
              </button>
            </div>
            {heroMode === 'expense' ? (
              <>
                <span className={styles.heroLabel}>{strings.goals.dedicatedSpendLabel}</span>
                <span className={styles.heroValue}>
                  {formatAmount(dedicatedTotals.dedicatedExpense)} {currency}
                </span>
                {range === 'month' && (
                  <span className={styles.heroSubtitle}>
                    {dedicatedTotals.percentOfMonthBudget}% {strings.goals.ofMonthBudgetSuffix}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className={styles.heroLabel}>{strings.goals.dedicatedIncomeLabel}</span>
                <span className={styles.heroValue}>
                  {formatAmount(dedicatedTotals.dedicatedIncome)} {currency}
                </span>
                {range === 'month' && (
                  <span className={styles.heroSubtitle}>
                    {dedicatedTotals.percentOfProjectedIncome}% {strings.goals.ofProjectedIncomeSuffix}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Fixed/Variable split by the parent goal's own type — no
              longer one mixed Fixed/Variable pair (that silently combined
              Expense/Income/Savings goals together). Horizontally
              scrolling since there are now 7 cards, not 3. */}
          <div className={styles.expenseCardsRow} data-hscroll="true">
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('fixedExpense')}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.fixedExpenseLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixedExpense)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('variableExpense')}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.variableExpenseLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variableExpense)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('fixedIncome')}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.fixedIncomeLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixedIncome)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('variableIncome')}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.variableIncomeLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variableIncome)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('fixedSavings')}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.fixedSavingsLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixedSavings)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('variableSavings')}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.variableSavingsLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variableSavings)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openBucketModal('transfers')}>
              <span className={styles.expenseCardIcon}>
                <ArrowLeftRight size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.transfersEstimatedCostLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.transfersCost)} {currency}
              </span>
              <span className={styles.expenseCardCaption}>
                {strings.goals.transfersAverageChargeLabel}: {formatAmount(dedicatedTotals.transfersAverageCharge)} {currency}
              </span>
            </button>
          </div>

          {openBucketKey && (
            <Modal title={bucketLabel[openBucketKey]} onClose={closeBucketModal}>
              {openBucketItems.length === 0 ? (
                <p className={styles.emptyText}>{strings.goals.bucketModalEmpty}</p>
              ) : (
                <div className={styles.bucketModalList}>
                  {openBucketItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/goals/${item.goalId}`}
                      className={styles.bucketModalRow}
                      onClick={closeBucketModal}
                    >
                      <span className={styles.bucketModalItemInfo}>
                        <span className={styles.bucketModalItemName}>{item.name}</span>
                        <span className={styles.bucketModalGoalName}>{item.goalName}</span>
                      </span>
                      <span className={styles.bucketModalAmount}>
                        {formatAmount(item.amount)} {item.currency}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Modal>
          )}

          {/* Title, the kind filter (or the search input once it's open),
              and the search trigger all share this one row. */}
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>{strings.goals.exploreTitle}</h2>
            {searchOpen ? (
              <div className={styles.searchRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={strings.goals.searchPlaceholder}
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
            ) : (
              <div className={styles.kindFilterRow}>
                {kindFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className={`${styles.kindFilterChip} ${kindFilter === filter.key ? styles.kindFilterChipActive : ''}`}
                    onClick={() => setKindFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
            {/* Hidden entirely (not just disabled) below SEARCH_ENABLED_ABOVE
                goals — a short list is faster to scan by eye than to search. */}
            {searchEnabled && (
              <button
                type="button"
                className={searchOpen ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton}
                aria-label="Search"
                aria-pressed={searchOpen}
                onClick={toggleSearch}
              >
                <Search size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>

          {goals.length === 0 ? (
            <p className={styles.emptyText}>{hasSearch ? strings.goals.emptySearch : strings.goals.emptyGoals}</p>
          ) : (
            <div className={`${styles.exploreList} ${isWeb ? webStyles.exploreList : ''}`}>
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.exploreRow} ${isWeb ? webStyles.exploreRow : ''}`}
                  onClick={() => router.push(`/goals/${goal.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/goals/${goal.id}`);
                    }
                  }}
                >
                  <div className={styles.exploreRowTop}>
                    <span className={styles.exploreRowIcon} style={{ background: goalIconTint(goal.name) }}>
                      {goalInitial(goal.name)}
                    </span>
                    <span className={styles.exploreRowName}>{goal.name}</span>
                    <span className={`${styles.typeBadge} ${typeBadgeClass[goal.type]}`}>{typeBadgeLabel[goal.type]}</span>
                    <ChevronRight size={18} strokeWidth={2} className={styles.exploreRowChevron} />
                  </div>
                  <div className={styles.exploreRowBottom}>
                    <span className={styles.exploreRowAmount}>
                      {formatAmount(goal.completed)} {strings.goals.completedOfSuffix} {formatAmount(goal.total)} {currency}
                    </span>
                    <div className={styles.exploreRowProgress}>
                      <div className={styles.exploreRowProgressTrack}>
                        <div className={styles.exploreRowProgressFill} style={{ width: `${goal.percent}%` }} />
                      </div>
                      <span className={styles.exploreRowPercent}>{goal.percent}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" className={styles.addButton} onClick={() => router.push('/goals/new')}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.goals.addGoal}
          </button>
        </>
      )}

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
                className={`${styles.monthOption} ${
                  index === monthIndex && pickerYear === year ? styles.monthOptionActive : ''
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
