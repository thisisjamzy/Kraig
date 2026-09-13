'use client';

// Add/edit a goal line item — its own page (not a modal over Goal Detail),
// reusing that screen's own useLogic(goalId) wholesale rather than
// duplicating its category/account-filtering and save logic here. Editing
// an existing item just seeds the same form state on mount via
// openEditItem; adding starts it fresh via openAdd. A successful save
// navigates back to the goal (see goalDetail/useLogic.ts's
// handleAddLineItem), same as this page's own back button.
//
// Laid out like the New Task / New Project forms (src/screens/TaskEdit,
// src/screens/CreateProject) — X/title/check header, a white Name+Amount+
// Notes card, and a list of expandable rows for every picker — rather than
// the plain stacked-select form this used to be. The due date row uses
// HeroUI's Calendar inline, same as TaskEdit's own Date row: the previous
// floating HeroDatePicker popover mispositioned itself to the top of the
// screen instead of anchoring under this row, so inline sidesteps that bug
// entirely rather than chasing it inside a third-party popover.

import { useEffect, useState } from 'react';
import { Calendar as HeroCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { X, Check, ChevronRight, Tag, AlertTriangle, Star, Wallet, CalendarDays, Repeat } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLogic, FIXED_ITEM_FREQUENCIES } from '@/src/logic/goalDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import { PRIORITY_LEVELS, NECESSITY_OPTIONS, NECESSITY_LABEL } from '@/src/viewmodels/projects';
import styles from './GoalLineItemFormScreen.module.css';

function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Day 0 of the month AFTER `monthIndex` (0-based) is the last real day of
// `monthIndex` itself — the standard trick for "how many days does this
// month have," leap years included.
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Monthly/Quarterly never let the user pick a month, only a day — the full
// 1-31 range (a 29th/30th/31st picked in a shorter month just rolls into
// the next one that occurrence, same as any "bill due on the 31st"
// calendar app; applyMonthlyDay/applyYearlyDay build the actual anchor date
// off whichever real month is current, so this array is only ever the list
// of button labels, never assumed to be valid in every month).
const MONTHLY_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

export function GoalLineItemFormScreen({ goalId, itemId }: { goalId: string; itemId?: string }) {
  const strings = useStrings();
  const router = useRouter();
  const {
    goal,
    isFixedGoal,
    lineItems,
    categories,

    openAdd,
    editingItemId,
    openEditItem,
    itemName,
    setItemName,
    itemDescription,
    setItemDescription,
    itemAmount,
    setItemAmount,
    itemPriority,
    setItemPriority,
    itemNecessity,
    setItemNecessity,
    itemCategoryId,
    setItemCategoryId,
    itemAccountId,
    setItemAccountId,
    itemDueDate,
    setItemDueDate,
    itemRecurrenceFrequency,
    setItemRecurrenceFrequency,
    accountOptionsForCategory,
    canSaveLineItem,
    savingItem,
    itemError,
    handleAddLineItem,

    loading,
    error,
  } = useLogic(goalId);

  // Seed the form exactly once — after the target item (if any) has
  // actually loaded, not before, or openEditItem would seed from nothing.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || loading) return;
    if (itemId) {
      const item = lineItems.find((entry) => entry.id === itemId);
      if (!item) return;
      openEditItem(item);
    } else {
      openAdd();
    }
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, itemId, lineItems, seeded]);

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [necessityPickerOpen, setNecessityPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateMonthCursor, setDateMonthCursor] = useState(() =>
    itemDueDate ? new Date(`${itemDueDate}T00:00:00`) : new Date()
  );

  const isEditing = Boolean(editingItemId);
  const selectedCategory = categories.find((category) => category.id === itemCategoryId) ?? null;
  const selectedAccount = accountOptionsForCategory(itemCategoryId).find((account) => account.id === itemAccountId) ?? null;

  // A Fixed item's due date IS its recurrence anchor (see the .listGroup
  // comment above) — what "day" actually means depends on which frequency
  // is picked, so both the row's own label and its expand panel's hint
  // change with it rather than showing the same generic "Due date" no
  // matter what's chosen.
  const dueDateLabel = !isFixedGoal
    ? strings.goalDetail.dueDateLabel
    : itemRecurrenceFrequency === 'Monthly'
      ? strings.goalDetail.dueDateLabelMonthly
      : itemRecurrenceFrequency === 'Quarterly'
        ? strings.goalDetail.dueDateLabelQuarterly
        : strings.goalDetail.dueDateLabelYearly;
  const dueDateHint =
    itemRecurrenceFrequency === 'Monthly'
      ? strings.goalDetail.dueDateHintMonthly
      : itemRecurrenceFrequency === 'Quarterly'
        ? strings.goalDetail.dueDateHintQuarterly
        : strings.goalDetail.dueDateHintYearly;

  // A Fixed item picks a plain day (number), not a calendar date — the
  // month component of that anchor still has to exist somewhere for
  // aggregation.ts's recurrence math (Yearly needs a real month, Quarterly
  // counts 3-month cycles from it), it's just never shown or chosen by
  // hand for Monthly/Quarterly: it's always "now," so picking a day is the
  // whole interaction. Falls back to today's own day/month whenever
  // itemDueDate is still empty, so the grids always have something
  // sensible pre-highlighted.
  const anchorSource = itemDueDate ? new Date(`${itemDueDate}T00:00:00`) : new Date();
  const anchorDay = anchorSource.getDate();
  const anchorMonthIndex = anchorSource.getMonth();
  const anchorYear = anchorSource.getFullYear();
  const yearlyDayOptions = Array.from({ length: daysInMonth(anchorYear, anchorMonthIndex) }, (_, i) => i + 1);

  function applyMonthlyDay(day: number) {
    const today = new Date();
    setItemDueDate(toDateOnly(new Date(today.getFullYear(), today.getMonth(), day)));
    setDatePickerOpen(false);
  }

  function applyYearlyMonth(monthIndex: number) {
    const day = Math.min(anchorDay, daysInMonth(anchorYear, monthIndex));
    setItemDueDate(toDateOnly(new Date(anchorYear, monthIndex, day)));
  }

  function applyYearlyDay(day: number) {
    setItemDueDate(toDateOnly(new Date(anchorYear, anchorMonthIndex, day)));
    setDatePickerOpen(false);
  }

  // The row's own value — a full "Mar 15, 2026" reads oddly for something
  // that just repeats on the 15th every month/quarter (the year is never
  // meaningful there), so a Fixed item shows only what it actually picked:
  // the day alone for Monthly/Quarterly, month+day (no year) for Yearly.
  const dueDateValue = !itemDueDate
    ? strings.goalDetail.dueDateNone
    : !isFixedGoal
      ? formatDateOnly(itemDueDate)
      : itemRecurrenceFrequency === 'Yearly'
        ? `${MONTH_NAMES[anchorMonthIndex]} ${anchorDay}`
        : `${strings.goalDetail.dueDateDayPrefix} ${anchorDay}`;

  function goBack() {
    router.push(`/goals/${goalId}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} onClick={goBack} aria-label={strings.goalDetail.backLabel}>
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.headerTitle}>
          {isEditing ? strings.goalDetail.editLineItemTitle : strings.goalDetail.addLineItem}
        </h1>
        <button
          type="button"
          className={`${styles.saveIconButton} ${canSaveLineItem ? styles.saveIconButtonActive : ''}`}
          disabled={!canSaveLineItem || savingItem}
          onClick={handleAddLineItem}
          aria-label={strings.goalDetail.save}
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
      </header>

      {goal && <p className={styles.goalName}>{goal.name}</p>}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && seeded && (
        <div className={styles.form}>
          <div className={styles.card}>
            <input
              className={styles.titleInput}
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              placeholder={strings.goalDetail.nameLabel}
            />
            <div className={styles.cardDivider} />
            <input
              className={styles.amountInput}
              inputMode="numeric"
              value={itemAmount}
              onChange={(event) => setItemAmount(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={strings.goalDetail.amountLabel}
            />
            <div className={styles.cardDivider} />
            <textarea
              className={styles.notesInput}
              rows={3}
              value={itemDescription}
              onChange={(event) => setItemDescription(event.target.value)}
              placeholder={strings.goalDetail.descriptionLabel}
            />
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setCategoryPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Tag size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.goalDetail.categoryLabel}</span>
              <span className={styles.listRowValue}>{selectedCategory ? selectedCategory.name : strings.goalDetail.noCategory}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {categoryPickerOpen && (
              <div className={styles.expandPanel}>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`${styles.optionRow} ${itemCategoryId === category.id ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setItemCategoryId(category.id);
                      setCategoryPickerOpen(false);
                    }}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setPriorityPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <AlertTriangle size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.goalDetail.priorityLabel}</span>
              <span className={styles.listRowValue}>{itemPriority}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {priorityPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  {PRIORITY_LEVELS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.chip} ${itemPriority === option ? styles.chipActive : ''}`}
                      onClick={() => {
                        setItemPriority(option);
                        setPriorityPickerOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setNecessityPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Star size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.goalDetail.necessityLabel}</span>
              <span className={styles.listRowValue}>{NECESSITY_LABEL[itemNecessity]}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {necessityPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  {NECESSITY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.chip} ${itemNecessity === option ? styles.chipActive : ''}`}
                      onClick={() => {
                        setItemNecessity(option);
                        setNecessityPickerOpen(false);
                      }}
                    >
                      {NECESSITY_LABEL[option]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setAccountPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Wallet size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.goalDetail.accountLabel}</span>
              <span className={styles.listRowValue}>{selectedAccount ? selectedAccount.name : strings.goalDetail.accountNone}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {accountPickerOpen && (
              <div className={styles.expandPanel}>
                <button
                  type="button"
                  className={`${styles.optionRow} ${!itemAccountId ? styles.optionRowActive : ''}`}
                  onClick={() => {
                    setItemAccountId('');
                    setAccountPickerOpen(false);
                  }}
                >
                  {strings.goalDetail.accountNone}
                </button>
                {accountOptionsForCategory(itemCategoryId).map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.optionRow} ${itemAccountId === account.id ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setItemAccountId(account.id);
                      setAccountPickerOpen(false);
                    }}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Repeats comes before Due date for a Fixed item — the due date
              picked below is read directly as this recurrence's own anchor
              (src/shared/firestore/upcomingPayments.ts), so which frequency
              is chosen first decides what that date actually means: a day
              of the month, a day within a 3-month cycle, or a month+day. */}
          {isFixedGoal && (
            <div className={styles.listGroup}>
              <button type="button" className={styles.listRow} onClick={() => setRecurrencePickerOpen((c) => !c)}>
                <span className={styles.listRowIcon}>
                  <Repeat size={16} strokeWidth={2} />
                </span>
                <span className={styles.listRowLabel}>{strings.goalDetail.recurrenceLabel}</span>
                <span className={styles.listRowValue}>{itemRecurrenceFrequency}</span>
                <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
              </button>
              {recurrencePickerOpen && (
                <div className={styles.expandPanel}>
                  <div className={styles.chipGroup}>
                    {FIXED_ITEM_FREQUENCIES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.chip} ${itemRecurrenceFrequency === option ? styles.chipActive : ''}`}
                        onClick={() => {
                          setItemRecurrenceFrequency(option);
                          setRecurrencePickerOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.listGroup}>
            {/* A plain div, not a button — a Variable item's inline clear
                (x) button below is a real, separately-clickable descendant,
                and a <button> can't legally contain another <button>. Kept
                as a div even for a Fixed item (no clear button there, due
                date is required — see canSaveLineItem) rather than
                switching element types conditionally. Keyboard/AT users
                still get the same toggle via role="button" + tabIndex. */}
            <div
              className={styles.listRow}
              role="button"
              tabIndex={0}
              onClick={() => setDatePickerOpen((c) => !c)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setDatePickerOpen((c) => !c);
                }
              }}
            >
              <span className={styles.listRowIcon}>
                <CalendarDays size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{dueDateLabel}</span>
              <span className={styles.listRowValue}>{dueDateValue}</span>
              {!isFixedGoal && itemDueDate && (
                <button
                  type="button"
                  className={styles.clearRowButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    setItemDueDate('');
                  }}
                  aria-label="Clear due date"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </div>
            {datePickerOpen && isFixedGoal && (
              <div className={styles.expandPanel}>
                <p className={styles.dueDateHint}>{dueDateHint}</p>
                {itemRecurrenceFrequency === 'Yearly' && (
                  <div className={styles.chipGroup}>
                    {MONTH_NAMES.map((name, index) => (
                      <button
                        key={name}
                        type="button"
                        className={`${styles.chip} ${anchorMonthIndex === index ? styles.chipActive : ''}`}
                        onClick={() => applyYearlyMonth(index)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.dayGrid}>
                  {(itemRecurrenceFrequency === 'Yearly' ? yearlyDayOptions : MONTHLY_DAY_OPTIONS).map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={`${styles.dayOption} ${anchorDay === day ? styles.dayOptionActive : ''}`}
                      onClick={() => (itemRecurrenceFrequency === 'Yearly' ? applyYearlyDay(day) : applyMonthlyDay(day))}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {datePickerOpen && !isFixedGoal && (
              <div className={styles.expandPanel}>
                <button
                  type="button"
                  className={`${styles.optionRow} ${!itemDueDate ? styles.optionRowActive : ''}`}
                  onClick={() => {
                    setItemDueDate('');
                    setDatePickerOpen(false);
                  }}
                >
                  {strings.goalDetail.dueDateNone}
                </button>
                <HeroCalendar.Root
                  focusedValue={parseDate(toDateOnly(dateMonthCursor))}
                  onFocusChange={(next) => setDateMonthCursor(new Date(next.year, next.month - 1, next.day))}
                  value={itemDueDate ? parseDate(itemDueDate) : undefined}
                  onChange={(next) => {
                    if (next) {
                      setItemDueDate(next.toString());
                      setDatePickerOpen(false);
                    }
                  }}
                >
                  <HeroCalendar.Header className={styles.calendarHeader}>
                    <HeroCalendar.NavButton slot="previous" className={styles.calendarNavButton} />
                    <HeroCalendar.Heading className={styles.calendarHeading} />
                    <HeroCalendar.NavButton slot="next" className={styles.calendarNavButton} />
                  </HeroCalendar.Header>
                  <HeroCalendar.Grid className={styles.calendarGrid}>
                    <HeroCalendar.GridHeader>
                      {(day) => <HeroCalendar.HeaderCell className={styles.weekdayCell}>{day}</HeroCalendar.HeaderCell>}
                    </HeroCalendar.GridHeader>
                    <HeroCalendar.GridBody>
                      {(cellDate) => (
                        <HeroCalendar.Cell date={cellDate} className={styles.dayCell}>
                          {({ formattedDate }) => <span className={styles.dayCellInner}>{formattedDate}</span>}
                        </HeroCalendar.Cell>
                      )}
                    </HeroCalendar.GridBody>
                  </HeroCalendar.Grid>
                </HeroCalendar.Root>
              </div>
            )}
          </div>

          {itemError && <p className={styles.errorText}>{itemError}</p>}
        </div>
      )}
    </div>
  );
}
