'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, GripVertical, SlidersHorizontal } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

interface ItemRow {
  id: string;
  goalId: string;
  goalName: string;
  name: string;
  amount: number;
  priority: Priority;
  necessity: GoalItemNecessity;
  dueDateObj: Date | null;
  categoryName: string;
  categoryColor: string;
}

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

// One draggable row — useSortable must run inside its own component (not a
// plain .map() callback) since it's a hook. Only the grip handle carries
// the drag listeners, so the rest of the row stays a normal tap target
// (openGoal) and dragging never fights the page's own vertical scroll.
function ItemCard({
  item,
  currency,
  draggable,
  onOpen,
}: {
  item: ItemRow;
  currency: string;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? `${styles.itemRow} ${styles.itemRowDragging}` : styles.itemRow}
    >
      {draggable && (
        <button type="button" className={styles.dragHandle} aria-label="Drag to reorder" {...attributes} {...listeners}>
          <GripVertical size={16} strokeWidth={2} />
        </button>
      )}
      <button type="button" className={styles.itemInfo} onClick={onOpen}>
        <span className={styles.itemGoal}>{item.goalName}</span>
        <p className={styles.itemName}>{item.name}</p>
        <div className={styles.itemTagRow}>
          <span className={styles.categoryTag} style={{ background: item.categoryColor }}>
            {item.categoryName}
          </span>
          <span className={styles.priorityTag}>{item.priority}</span>
          <span className={item.necessity === 'MustHave' ? styles.necessityTagMust : styles.necessityTagNice}>
            {NECESSITY_LABEL[item.necessity]}
          </span>
        </div>
      </button>
      <div className={styles.itemTrailing}>
        <span className={styles.itemAmount}>
          {formatAmount(item.amount)} {currency}
        </span>
        {item.dueDateObj && (
          <span className={styles.itemDueDate}>
            {item.dueDateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
          </span>
        )}
      </div>
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
    handleDragEnd,
    currency,
    openGoal,
    goBack,
    loading,
  } = useLogic();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function onDragEnd(event: DragEndEvent) {
    await handleDragEnd(event);
  }

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
        first), then drag to fine-tune the order yourself — it&apos;s remembered until you change it again.
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
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.list}>
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      currency={currency}
                      draggable={sortMode === 'custom'}
                      onOpen={() => openGoal(item.goalId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}
