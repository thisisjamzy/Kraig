'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useLogic, type GoalItemSort } from '@/src/logic/goalItems/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import { PRIORITY_LEVELS, NECESSITY_OPTIONS, NECESSITY_LABEL } from '@/src/viewmodels/projects';
import type { Priority, GoalItemNecessity } from '@/src/shared/firestore/types';
import styles from './GoalItemsScreen.module.css';

const SORT_MODES: GoalItemSort[] = ['custom', 'priority', 'ease'];
const SORT_LABEL: Record<GoalItemSort, string> = {
  custom: 'Custom',
  priority: 'Priority',
  ease: 'Ease',
};

function FilterMenu({
  priorityFilter,
  togglePriorityFilter,
  necessityFilter,
  toggleNecessityFilter,
}: {
  priorityFilter: Priority[];
  togglePriorityFilter: (priority: Priority) => void;
  necessityFilter: GoalItemNecessity[];
  toggleNecessityFilter: (necessity: GoalItemNecessity) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCount = priorityFilter.length + necessityFilter.length;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open]);

  return (
    <div className={styles.filterWrap} ref={containerRef}>
      <button type="button" className={styles.filterTrigger} onClick={() => setOpen((current) => !current)}>
        <SlidersHorizontal size={14} strokeWidth={2.25} />
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>

      {open && (
        <div className={styles.filterPopover}>
          <p className={styles.filterGroupLabel}>Priority</p>
          {PRIORITY_LEVELS.map((priority) => (
            <label key={priority} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={priorityFilter.includes(priority)}
                onChange={() => togglePriorityFilter(priority)}
              />
              {priority}
            </label>
          ))}
          <p className={styles.filterGroupLabel}>Needs</p>
          {NECESSITY_OPTIONS.map((necessity) => (
            <label key={necessity} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={necessityFilter.includes(necessity)}
                onChange={() => toggleNecessityFilter(necessity)}
              />
              {NECESSITY_LABEL[necessity]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalItemsScreen() {
  const {
    items,
    sortMode,
    setSortMode,
    priorityFilter,
    togglePriorityFilter,
    necessityFilter,
    toggleNecessityFilter,
    applySortAsCustomOrder,
    moveItem,
    currency,
    openGoal,
    goBack,
    loading,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>All goal items</h1>
        <FilterMenu
          priorityFilter={priorityFilter}
          togglePriorityFilter={togglePriorityFilter}
          necessityFilter={necessityFilter}
          toggleNecessityFilter={toggleNecessityFilter}
        />
      </header>

      <p className={styles.hintText}>
        Everything left to do across every goal. Sort by priority (nearest deadline first) or ease (smallest cost
        first), then fine-tune the order yourself — it&apos;s remembered until you change it again.
      </p>

      <div className={styles.chipGroup}>
        {SORT_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={`${styles.chip} ${sortMode === mode ? styles.chipActive : ''}`}
            onClick={() => setSortMode(mode)}
          >
            {SORT_LABEL[mode]}
          </button>
        ))}
      </div>

      {sortMode !== 'custom' && (
        <button type="button" className={styles.applyButton} onClick={applySortAsCustomOrder}>
          Use this order
        </button>
      )}

      <ScreenState loading={loading} />

      {!loading && (
        <>
          {items.length === 0 ? (
            <p className={styles.emptyText}>Nothing left to do — every goal item is complete.</p>
          ) : (
            <div className={styles.list}>
              {items.map((item, index) => (
                <div key={item.id} className={styles.itemRow}>
                  <button type="button" className={styles.itemInfo} onClick={() => openGoal(item.goalId)}>
                    <span className={styles.itemGoal}>{item.goalName}</span>
                    <p className={styles.itemName}>{item.name}</p>
                    <span className={styles.itemAmount}>
                      {formatAmount(item.amount)} {currency}
                    </span>
                    <div className={styles.itemTagRow}>
                      <span className={styles.priorityTag}>{item.priority}</span>
                      <span className={item.necessity === 'MustHave' ? styles.necessityTagMust : styles.necessityTagNice}>
                        {NECESSITY_LABEL[item.necessity]}
                      </span>
                    </div>
                  </button>
                  {sortMode === 'custom' && (
                    <div className={styles.reorderButtons}>
                      <button
                        type="button"
                        className={styles.reorderButton}
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        <ChevronUp size={14} strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className={styles.reorderButton}
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        aria-label="Move down"
                      >
                        <ChevronDown size={14} strokeWidth={2.25} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
