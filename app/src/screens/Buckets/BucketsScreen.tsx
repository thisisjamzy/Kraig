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
import { useLogic, type BucketKindFilter, type DedicatedGroupKey } from '@/src/logic/buckets/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { BucketsHeader } from '@/src/widgets/BucketsHeader/BucketsHeader';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './BucketsScreen.module.css';
import webStyles from './BucketsScreen.web.module.css';
import { BucketCardView } from '@/src/screens/Planning/BucketCardView';
import p from '@/src/screens/Planning/Planning.module.css';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

// Search only pays for itself once there's actually something to search
// through — below this, scanning a short list by eye is faster than typing.
const SEARCH_ENABLED_ABOVE = 20;

export function BucketsScreen() {
  const router = useRouter();
  const strings = useStrings();
  const isWeb = useIsWeb();
  const {
    currency,
    buckets,
    cards,
    viewedMonth,
    allBucketsCount,
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
    openGroupKey,
    openGroupModal,
    closeGroupModal,
    openGroupItems,
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

  const kindFilters: { key: BucketKindFilter; label: string }[] = [
    { key: 'All', label: strings.buckets.filterAll },
    { key: 'Fixed', label: strings.buckets.filterFixed },
    { key: 'Variable', label: strings.buckets.filterVariable },
  ];

  // The dashboard card labels reused as the drill-down modal's own title —
  // BucketsScreen.web.module.css/mobile classes already own the card copy
  // itself, this just maps each group key back to the same string.
  const groupLabel: Record<DedicatedGroupKey, string> = {
    fixedExpense: strings.buckets.fixedExpenseLabel,
    variableExpense: strings.buckets.variableExpenseLabel,
    fixedIncome: strings.buckets.fixedIncomeLabel,
    variableIncome: strings.buckets.variableIncomeLabel,
    fixedSavings: strings.buckets.fixedSavingsLabel,
    variableSavings: strings.buckets.variableSavingsLabel,
    transfers: strings.buckets.transfersEstimatedCostLabel,
  };

  const hasSearch = searchQuery.trim().length > 0;
  const searchEnabled = allBucketsCount > SEARCH_ENABLED_ABOVE;

  return (
    <div className={`${styles.page} ${isWeb ? webStyles.page : ''}`}>
      <BucketsHeader range={range} onChangeRange={setRange} />

      {/* The month/date picker's own row — deliberately not in BucketsHeader
          (that's this mini-app's shared "app bar", used by all three tabs)
          and not floating on top of the hero card either; its own row in
          the page's normal content flow, only shown in "month" mode. */}
      {range === 'month' && (
        <div className={styles.dateRow}>
          <button type="button" className={styles.dateButton} onClick={openMonthPicker} aria-label={strings.buckets.changeMonthLabel}>
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
                {strings.buckets.heroToggleExpense}
              </button>
              <button
                type="button"
                className={`${styles.heroToggleSegment} ${heroMode === 'income' ? styles.heroToggleSegmentActive : ''}`}
                onClick={() => setHeroMode('income')}
              >
                {strings.buckets.heroToggleIncome}
              </button>
            </div>
            {heroMode === 'expense' ? (
              <>
                <span className={styles.heroLabel}>{strings.buckets.dedicatedSpendLabel}</span>
                <span className={styles.heroValue}>
                  {formatAmount(dedicatedTotals.dedicatedExpense)} {currency}
                </span>
                {range === 'month' && (
                  <span className={styles.heroSubtitle}>
                    {dedicatedTotals.percentOfMonthBudget}% {strings.buckets.ofMonthBudgetSuffix}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className={styles.heroLabel}>{strings.buckets.dedicatedIncomeLabel}</span>
                <span className={styles.heroValue}>
                  {formatAmount(dedicatedTotals.dedicatedIncome)} {currency}
                </span>
                {range === 'month' && (
                  <span className={styles.heroSubtitle}>
                    {dedicatedTotals.percentOfProjectedIncome}% {strings.buckets.ofProjectedIncomeSuffix}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Fixed/Variable split by the parent bucket's own type — no
              longer one mixed Fixed/Variable pair (that silently combined
              Expense/Income/Savings buckets together). Horizontally
              scrolling since there are now 7 cards, not 3. */}
          <div className={styles.expenseCardsRow} data-hscroll="true">
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('fixedExpense')}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.fixedExpenseLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixedExpense)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('variableExpense')}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.variableExpenseLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variableExpense)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('fixedIncome')}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.fixedIncomeLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixedIncome)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('variableIncome')}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.variableIncomeLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variableIncome)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('fixedSavings')}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.fixedSavingsLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixedSavings)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('variableSavings')}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.variableSavingsLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variableSavings)} {currency}
              </span>
            </button>
            <button type="button" className={styles.expenseCard} onClick={() => openGroupModal('transfers')}>
              <span className={styles.expenseCardIcon}>
                <ArrowLeftRight size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.buckets.transfersEstimatedCostLabel}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.transfersCost)} {currency}
              </span>
              <span className={styles.expenseCardCaption}>
                {strings.buckets.transfersAverageChargeLabel}: {formatAmount(dedicatedTotals.transfersAverageCharge)} {currency}
              </span>
            </button>
          </div>

          <Link href="/settings/archived-buckets" className={styles.archivedLink}>
            Archived buckets
          </Link>

          {openGroupKey && (
            <Modal title={groupLabel[openGroupKey]} onClose={closeGroupModal}>
              {openGroupItems.length === 0 ? (
                <p className={styles.emptyText}>{strings.buckets.groupModalEmpty}</p>
              ) : (
                <div className={styles.groupModalList}>
                  {openGroupItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/budget/bucket/${item.goalId}?month=${viewedMonth}`}
                      className={styles.groupModalRow}
                      onClick={closeGroupModal}
                    >
                      <span className={styles.groupModalItemInfo}>
                        <span className={styles.groupModalItemName}>{item.name}</span>
                        <span className={styles.groupModalBucketName}>{item.bucketName}</span>
                      </span>
                      <span className={styles.groupModalAmount}>
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
            <h2 className={styles.sectionTitle}>{strings.buckets.exploreTitle}</h2>
            {searchOpen ? (
              <div className={styles.searchRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={strings.buckets.searchPlaceholder}
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
                buckets — a short list is faster to scan by eye than to search. */}
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

          {buckets.length === 0 ? (
            <p className={styles.emptyText}>{hasSearch ? strings.buckets.emptySearch : strings.buckets.emptyBuckets}</p>
          ) : (
            // The same bucket card as Planning's Budget tab — opens the same
            // bucket details page, for the month browsed above.
            <div className={`${p.tokens} ${styles.cardList} ${isWeb ? webStyles.exploreList : ''}`}>
              {cards.map((card) => (
                <BucketCardView key={card.id} card={card} currency={currency} month={viewedMonth} />
              ))}
            </div>
          )}

          <button type="button" className={styles.addButton} onClick={() => router.push('/buckets/new')}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.buckets.addBucket}
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
