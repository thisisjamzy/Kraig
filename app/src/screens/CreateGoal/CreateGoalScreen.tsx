'use client';

// Laid out like the New Task / New Project / New goal line item forms
// (src/screens/TaskEdit, src/screens/CreateProject, src/screens/
// GoalLineItemForm) — X/title/check header, a white Name+Description card,
// and a list of expandable rows for every picker — rather than the plain
// stacked-label form this used to be.

import { useState } from 'react';
import { X, Check, ChevronRight, Tag, Layers, Coins, CalendarDays } from 'lucide-react';
import { Calendar as HeroCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { useLogic } from '@/src/logic/createGoal/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import styles from './CreateGoalScreen.module.css';

function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function CreateGoalScreen() {
  const strings = useStrings();
  const {
    name,
    setName,
    description,
    setDescription,
    deadline,
    setDeadline,
    currency,
    setCurrency,
    currencyOptions,
    kind,
    setKind,
    type,
    setType,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
  } = useLogic();

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateMonthCursor, setDateMonthCursor] = useState(() => (deadline ? new Date(`${deadline}T00:00:00`) : new Date()));

  const canSave = name.trim().length > 0 && !saving;
  const selectedCurrency = currencyOptions.find((option) => option.code === currency) ?? null;

  const typeLabel: Record<typeof type, string> = {
    Expense: strings.createGoal.typeExpense,
    Income: strings.createGoal.typeIncome,
    Savings: strings.createGoal.typeSavings,
    Transfer: strings.createGoal.typeTransfer,
  };
  const typeHint: Record<typeof type, string> = {
    Expense: strings.createGoal.typeExpenseHint,
    Income: strings.createGoal.typeIncomeHint,
    Savings: strings.createGoal.typeSavingsHint,
    Transfer: strings.createGoal.typeTransferHint,
  };
  const typeOptions: (typeof type)[] = ['Expense', 'Income', 'Savings', 'Transfer'];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} onClick={goBack} aria-label={strings.goalDetail.backLabel}>
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.headerTitle}>{strings.createGoal.title}</h1>
        <button
          type="button"
          className={`${styles.saveIconButton} ${canSave ? styles.saveIconButtonActive : ''}`}
          disabled={!canSave}
          onClick={handleSave}
          aria-label={strings.createGoal.save}
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          <div className={styles.card}>
            <input
              className={styles.titleInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.createGoal.namePlaceholder}
            />
            <div className={styles.cardDivider} />
            <textarea
              className={styles.notesInput}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.createGoal.descriptionLabel}
            />
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setTypePickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Layers size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.createGoal.typeLabel}</span>
              <span className={styles.listRowValue}>{typeLabel[type]}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {typePickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  {typeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.chip} ${type === option ? styles.chipActive : ''}`}
                      onClick={() => {
                        setType(option);
                        setTypePickerOpen(false);
                      }}
                    >
                      {typeLabel[option]}
                    </button>
                  ))}
                </div>
                <p className={styles.hintText}>{typeHint[type]}</p>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setKindPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Tag size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.createGoal.kindLabel}</span>
              <span className={styles.listRowValue}>
                {kind === 'Fixed' ? strings.createGoal.kindFixed : strings.createGoal.kindVariable}
              </span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {kindPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  <button
                    type="button"
                    className={`${styles.chip} ${kind === 'Variable' ? styles.chipActive : ''}`}
                    onClick={() => {
                      setKind('Variable');
                      setKindPickerOpen(false);
                    }}
                  >
                    {strings.createGoal.kindVariable}
                  </button>
                  <button
                    type="button"
                    className={`${styles.chip} ${kind === 'Fixed' ? styles.chipActive : ''}`}
                    onClick={() => {
                      setKind('Fixed');
                      setKindPickerOpen(false);
                    }}
                  >
                    {strings.createGoal.kindFixed}
                  </button>
                </div>
                <p className={styles.hintText}>
                  {kind === 'Fixed' ? strings.createGoal.kindFixedHint : strings.createGoal.kindVariableHint}
                </p>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setCurrencyPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Coins size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.createGoal.currencyLabel}</span>
              <span className={styles.listRowValue}>{selectedCurrency ? selectedCurrency.name : currency}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {currencyPickerOpen && (
              <div className={styles.expandPanel}>
                {currencyOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className={`${styles.optionRow} ${currency === option.code ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setCurrency(option.code);
                      setCurrencyPickerOpen(false);
                    }}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
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
              <span className={styles.listRowLabel}>{strings.createGoal.deadlineLabel}</span>
              <span className={styles.listRowValue}>
                {deadline ? formatDateOnly(deadline) : strings.createGoal.deadlinePlaceholder}
              </span>
              {deadline && (
                <button
                  type="button"
                  className={styles.clearRowButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeadline('');
                  }}
                  aria-label="Clear target date"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </div>
            {datePickerOpen && (
              <div className={styles.expandPanel}>
                <button
                  type="button"
                  className={`${styles.optionRow} ${!deadline ? styles.optionRowActive : ''}`}
                  onClick={() => {
                    setDeadline('');
                    setDatePickerOpen(false);
                  }}
                >
                  {strings.createGoal.deadlinePlaceholder}
                </button>
                <HeroCalendar.Root
                  focusedValue={parseDate(toDateOnly(dateMonthCursor))}
                  onFocusChange={(next) => setDateMonthCursor(new Date(next.year, next.month - 1, next.day))}
                  value={deadline ? parseDate(deadline) : undefined}
                  onChange={(next) => {
                    if (next) {
                      setDeadline(next.toString());
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

          <p className={styles.hintText}>{strings.createGoal.addLineItemsHint}</p>

          {saveError && <p className={styles.errorText}>{saveError}</p>}
        </div>
      )}
    </div>
  );
}
