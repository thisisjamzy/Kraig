'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, Repeat, Search, Shuffle, X } from 'lucide-react';
import { useLogic, type GoalKindFilter } from '@/src/logic/goals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { GoalsHeader } from '@/src/widgets/GoalsHeader/GoalsHeader';
import { goalIconTint, goalInitial } from '@/src/viewmodels/goalIcons';
import styles from './GoalsScreen.module.css';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

// Search only pays for itself once there's actually something to search
// through — below this, scanning a short list by eye is faster than typing.
const SEARCH_ENABLED_ABOVE = 20;

export function GoalsScreen() {
  const router = useRouter();
  const strings = useStrings();
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
    dedicatedTotals,
    loading,
    error,
  } = useLogic();

  const kindFilters: { key: GoalKindFilter; label: string }[] = [
    { key: 'All', label: strings.goals.filterAll },
    { key: 'Fixed', label: strings.goals.filterFixed },
    { key: 'Variable', label: strings.goals.filterVariable },
  ];

  const hasSearch = searchQuery.trim().length > 0;
  const searchEnabled = allGoalsCount > SEARCH_ENABLED_ABOVE;

  return (
    <div className={styles.page}>
      <GoalsHeader range={range} onChangeRange={setRange} />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          <div className={styles.heroCard}>
            <span className={styles.heroLabel}>{strings.goals.dedicatedSpendLabel}</span>
            <span className={styles.heroValue}>
              {formatAmount(dedicatedTotals.dedicated)} {currency}
            </span>
            {range === 'month' && (
              <span className={styles.heroSubtitle}>
                {dedicatedTotals.percentOfMonthBudget}% {strings.goals.ofMonthBudgetSuffix}
              </span>
            )}
          </div>

          <div className={styles.expenseCardsRow}>
            <div className={styles.expenseCard}>
              <span className={styles.expenseCardIcon}>
                <Repeat size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.filterFixed}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.fixed)} {currency}
              </span>
            </div>
            <div className={styles.expenseCard}>
              <span className={styles.expenseCardIcon}>
                <Shuffle size={16} strokeWidth={2} />
              </span>
              <span className={styles.expenseCardLabel}>{strings.goals.filterVariable}</span>
              <span className={styles.expenseCardValue}>
                {formatAmount(dedicatedTotals.variable)} {currency}
              </span>
            </div>
          </div>

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
            <div className={styles.exploreList}>
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  role="button"
                  tabIndex={0}
                  className={styles.exploreRow}
                  onClick={() => router.push(`/goals/${goal.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/goals/${goal.id}`);
                    }
                  }}
                >
                  <span className={styles.exploreRowIcon} style={{ background: goalIconTint(goal.name) }}>
                    {goalInitial(goal.name)}
                  </span>
                  <div className={styles.exploreRowText}>
                    <span className={styles.exploreRowName}>{goal.name}</span>
                    <span className={styles.exploreRowAmount}>
                      {formatAmount(goal.completed)} {strings.goals.completedOfSuffix} {formatAmount(goal.total)} {currency}
                    </span>
                  </div>
                  <div className={styles.exploreRowEnd}>
                    <div className={styles.exploreRowProgressTrack}>
                      <div className={styles.exploreRowProgressFill} style={{ width: `${goal.percent}%` }} />
                    </div>
                    <ChevronRight size={18} strokeWidth={2} className={styles.exploreRowChevron} />
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
    </div>
  );
}
