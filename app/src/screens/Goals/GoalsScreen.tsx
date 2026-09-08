'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronDown, Plus, ListOrdered, Search, X, Check, Pencil, Trash2 } from 'lucide-react';
import { useLogic, type GoalKindFilter, type ProportionsMode } from '@/src/logic/goals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { DonutChart, type DonutSegment } from '@/src/widgets/DonutChart/DonutChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { NECESSITY_LABEL } from '@/src/viewmodels/projects';
import styles from './GoalsScreen.module.css';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

const PROPORTIONS_MODES: ProportionsMode[] = ['priority', 'type', 'category'];

export function GoalsScreen() {
  const router = useRouter();
  const strings = useStrings();
  const {
    currency,
    goals,
    kindFilter,
    setKindFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    toggleSearch,
    totalGoalAmount,
    proportionsMode,
    setProportionsMode,
    proportionsBreakdown,
    lineItems,
    archiveGoal,
    deleteLineItem,
    loading,
    error,
  } = useLogic();

  const [confirmGoalId, setConfirmGoalId] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{
    goalId: string;
    itemId: string;
    budgetRuleId: string | null;
  } | null>(null);

  const kindFilters: { key: GoalKindFilter; label: string }[] = [
    { key: 'All', label: strings.goals.filterAll },
    { key: 'Fixed', label: strings.goals.filterFixed },
    { key: 'Variable', label: strings.goals.filterVariable },
  ];

  const proportionsLabel: Record<ProportionsMode, string> = {
    priority: strings.goals.proportionsByPriority,
    type: strings.goals.proportionsByType,
    category: strings.goals.proportionsByCategory,
  };

  const segments: DonutSegment[] = proportionsBreakdown.map((group) => ({
    label: group.label,
    value: group.amount,
    color: group.color,
  }));

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => router.push('/home')} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.goals.tabGoals}</h1>
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
        </div>
      </header>

      {searchOpen && (
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
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {segments.length > 0 && (
            <div className={styles.overviewCard}>
              <div className={styles.overviewHeaderRow}>
                <div className={styles.overviewTotal}>
                  <span className={styles.overviewTotalLabel}>{strings.goals.totalGoalLabel}</span>
                  <span className={styles.overviewTotalValue}>
                    {formatAmount(totalGoalAmount)} {currency}
                  </span>
                </div>
                <ActionMenu
                  ariaLabel="Choose what the chart groups by"
                  triggerClassName={styles.proportionsFilterButton}
                  triggerIcon={
                    <>
                      {proportionsLabel[proportionsMode]}
                      <ChevronDown size={14} strokeWidth={2.25} />
                    </>
                  }
                  items={PROPORTIONS_MODES.map((mode) => ({
                    key: mode,
                    label: proportionsLabel[mode],
                    icon: mode === proportionsMode ? <Check size={16} strokeWidth={2} /> : <span />,
                    onSelect: () => setProportionsMode(mode),
                  }))}
                />
              </div>

              <DonutChart segments={segments} size={140} thickness={70} legendPosition="bottom" legendWrap />
            </div>
          )}

          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>{strings.goals.tabGoals}</h2>
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
          </div>

          {goals.length === 0 ? (
            <p className={styles.emptyText}>{hasSearch ? strings.goals.emptySearch : strings.goals.emptyGoals}</p>
          ) : (
            <div className={styles.hScrollList}>
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  role="button"
                  tabIndex={0}
                  className={styles.card}
                  onClick={() => router.push(`/goals/${goal.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/goals/${goal.id}`);
                    }
                  }}
                >
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.cardText}>
                      <p className={styles.cardName}>{goal.name}</p>
                      <p className={styles.cardCategory}>
                        {goal.completedLineItemCount}/{goal.lineItemCount} {strings.goals.itemsDone}
                      </p>
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                      <ActionMenu
                        title={goal.name}
                        ariaLabel={`Actions for ${goal.name}`}
                        items={[
                          {
                            key: 'archive',
                            label: strings.goals.archiveAction,
                            icon: <Trash2 size={16} strokeWidth={1.75} />,
                            onSelect: () => setConfirmGoalId(goal.id),
                            danger: true,
                          },
                        ]}
                      />
                    </span>
                  </div>
                  <div className={styles.track}>
                    <div className={styles.fill} style={{ width: `${goal.percent}%` }} />
                  </div>
                  <div className={styles.amountRow}>
                    <span className={styles.amountValue}>
                      {formatAmount(goal.completed)} {currency}
                    </span>
                    <span className={styles.amountMuted}>
                      {strings.goals.completedOfSuffix} {formatAmount(goal.total)} {currency} &bull; {goal.percent}%
                    </span>
                  </div>
                  {goal.deadline && (
                    <div className={styles.metaRow}>
                      <span>
                        {strings.goals.deadlinePrefix}{' '}
                        {goal.deadline.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button type="button" className={styles.addButton} onClick={() => router.push('/goals/new')}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.goals.addGoal}
          </button>

          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>{strings.goals.lineItemsTitle}</h2>
            <button type="button" className={styles.rankedButton} onClick={() => router.push('/goals/items')}>
              <ListOrdered size={14} strokeWidth={2.25} />
              {strings.goals.rankedButton}
            </button>
          </div>

          {lineItems.length === 0 ? (
            <p className={styles.emptyText}>{hasSearch ? strings.goals.emptySearch : strings.goals.emptyLineItems}</p>
          ) : (
            <div className={styles.vScrollList}>
              {lineItems.map((item) => {
                const kindBadgeLabel =
                  item.goalKindRaw === 'Fixed'
                    ? strings.goals.filterFixed
                    : item.goalKindRaw === 'Variable'
                      ? strings.goals.filterVariable
                      : strings.goals.kindUnclassified;
                const kindBadgeClass =
                  item.goalKindRaw === 'Fixed'
                    ? styles.kindBadgeFixed
                    : item.goalKindRaw === 'Variable'
                      ? styles.kindBadgeVariable
                      : styles.kindBadgeUnclassified;
                return (
                  <div key={item.id} className={styles.lineItem}>
                    <div className={styles.lineItemHeaderRow}>
                      <p className={styles.lineItemGoalName}>{item.goalName}</p>
                      <div className={styles.lineItemHeaderRight}>
                        <p className={item.dueDate ? styles.dueDateText : styles.dueDateTextPlaceholder}>
                          {item.dueDate
                            ? item.dueDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                            : strings.goalDetail.dueDateNone}
                        </p>
                        <ActionMenu
                          title={item.name}
                          ariaLabel={`Actions for ${item.name}`}
                          items={[
                            {
                              key: 'view',
                              label: strings.goals.viewGoal,
                              icon: <ListOrdered size={16} strokeWidth={1.75} />,
                              onSelect: () => router.push(`/goals/${item.goalId}`),
                            },
                            {
                              key: 'edit',
                              label: strings.goalDetail.editLineItem,
                              icon: <Pencil size={16} strokeWidth={1.75} />,
                              onSelect: () => router.push(`/edit-goal-item/${item.goalId}/${item.id}`),
                            },
                            {
                              key: 'delete',
                              label: strings.goalDetail.deleteLineItem,
                              icon: <Trash2 size={16} strokeWidth={1.75} />,
                              onSelect: () =>
                                setConfirmDeleteItem({ goalId: item.goalId, itemId: item.id, budgetRuleId: item.budgetRuleId }),
                              danger: true,
                            },
                          ]}
                        />
                      </div>
                    </div>

                    <div className={styles.lineItemNameRow}>
                      <p className={styles.lineItemName}>{item.name}</p>
                      <p className={styles.lineItemAmount}>
                        {formatAmount(item.amount)} {item.currency}
                      </p>
                    </div>

                    <div className={styles.lineItemCategoryRow}>
                      <p className={styles.lineItemCategoryText}>{item.categoryName}</p>
                      {(item.addedToBudget || item.budgetRuleId) && (
                        <span className={styles.addedToBudgetTag}>{strings.goalDetail.addedToBudgetTag}</span>
                      )}
                    </div>

                    <div className={styles.lineItemTagRow}>
                      <span className={kindBadgeClass}>{kindBadgeLabel}</span>
                      <span className={styles.priorityTag}>{item.priority}</span>
                      <span className={item.necessity === 'MustHave' ? styles.necessityTagMust : styles.necessityTagNice}>
                        {NECESSITY_LABEL[item.necessity]}
                      </span>
                      {item.completed ? (
                        <span className={styles.doneTag}>{strings.goalDetail.completedTag}</span>
                      ) : (
                        <span className={item.hasFunds ? styles.fundsBadgeOk : styles.fundsBadgeShort}>
                          {item.hasFunds ? 'Possible' : 'Not possible'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {confirmGoalId && (
        <ConfirmDialog
          title={strings.goals.archiveGoalConfirmTitle}
          message={strings.goals.archiveGoalConfirmMessage}
          confirmLabel={strings.goals.archiveAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            archiveGoal(confirmGoalId);
            setConfirmGoalId(null);
          }}
          onCancel={() => setConfirmGoalId(null)}
        />
      )}

      {confirmDeleteItem && (
        <ConfirmDialog
          title={strings.goalDetail.deleteLineItemConfirmTitle}
          message={strings.goalDetail.deleteLineItemConfirmMessage}
          confirmLabel={strings.goalDetail.deleteLineItem}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            deleteLineItem(confirmDeleteItem.goalId, confirmDeleteItem.itemId, confirmDeleteItem.budgetRuleId);
            setConfirmDeleteItem(null);
          }}
          onCancel={() => setConfirmDeleteItem(null)}
        />
      )}
    </div>
  );
}
