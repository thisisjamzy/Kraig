'use client';

// The task form's recurring-task sheets (src/logic/taskEdit/useLogic.ts):
//   - RepeatSheet: the presets, labelled from the task's date, with a check
//     on the chosen one;
//   - CustomRepeatSheet: full screen — repeat every N units, which weekdays
//     (weeks), which day (months), how it ends — with a live summary and the
//     next three dates;
//   - ScopeSheet: which dates a save or delete applies to;
//   - ConflictSheet: the dates of a series that clash with blocked tasks.
// Same card look and tokens as the form (CardForm.module.css).

import { useState } from 'react';
import { Check, ChevronDown, Minus, Plus, X } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { cardFormStyles } from '@/src/widgets/CardForm/CardForm';
import {
  WEEKDAYS,
  dateKey,
  describeRule,
  isLastOfMonth,
  nextDates,
  nthOfMonth,
  weekdayOf,
  type Freq,
  type RecurrenceRule,
  type RepeatPreset,
  type Weekday,
} from '@/src/viewmodels/recurrence';
import type { OccurrenceCheck } from '@/src/viewmodels/scheduling';
import type { ConflictSheet as ConflictSheetState, ScopeSheet as ScopeSheetState } from '@/src/logic/taskEdit/useLogic';
import type { EditScope } from '@/src/shared/tasks/recurringPlan';
import styles from './RepeatSheets.module.css';

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
const DAY_NAMES: Record<Weekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};
const DAY_LETTER: Record<Weekday, string> = { MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S', SU: 'S' };
const UNITS: { freq: Freq; one: string; many: string }[] = [
  { freq: 'DAILY', one: 'day', many: 'days' },
  { freq: 'WEEKLY', one: 'week', many: 'weeks' },
  { freq: 'MONTHLY', one: 'month', many: 'months' },
  { freq: 'YEARLY', one: 'year', many: 'years' },
];

function shortDay(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------

export function RepeatSheet({
  options,
  value,
  onChoose,
  onClose,
}: {
  options: { id: RepeatPreset; label: string }[];
  value: RepeatPreset;
  onChoose: (preset: RepeatPreset) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Repeat" onClose={onClose}>
      <div className={`${cardFormStyles.sheetList} ${styles.tallList}`}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`${cardFormStyles.sheetOption} ${styles.checkOption}`}
            aria-pressed={value === option.id}
            onClick={() => onChoose(option.id)}
          >
            {option.label}
            {value === option.id && <Check size={20} strokeWidth={2.5} className={styles.check} aria-hidden />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n) || min));
  return (
    <span className={styles.stepper}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        aria-label={label}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </span>
  );
}

type MonthlyMode = 'day' | 'nth' | 'last';
type Ends = 'never' | 'on' | 'after';

/** Full-screen custom rule editor, seeded from the current rule (or a
 * weekly one on the task's own weekday). */
export function CustomRepeatSheet({
  date,
  initial,
  onDone,
  onClose,
}: {
  /** The task's date (and time) — the rule's first date. */
  date: Date;
  initial: RecurrenceRule | null;
  onDone: (rule: RecurrenceRule) => void;
  onClose: () => void;
}) {
  const own = weekdayOf(date);
  const [interval, setIntervalValue] = useState(initial?.interval ?? 1);
  const [freq, setFreq] = useState<Freq>(initial?.freq ?? 'WEEKLY');
  const [days, setDays] = useState<Weekday[]>(initial?.byDay?.length ? initial.byDay : [own]);
  const [monthly, setMonthly] = useState<MonthlyMode>(
    initial?.byNthDay ? (initial.byNthDay.n === -1 ? 'last' : 'nth') : 'day'
  );
  const [ends, setEnds] = useState<Ends>(initial?.count ? 'after' : initial?.until ? 'on' : 'never');
  const [until, setUntil] = useState(
    initial?.until ?? dateKey(new Date(date.getFullYear(), date.getMonth() + 3, date.getDate()))
  );
  const [count, setCount] = useState(initial?.count ?? 10);

  const lastOption = isLastOfMonth(date);
  const monthlyMode: MonthlyMode = monthly === 'last' && !lastOption ? 'nth' : monthly;

  const rule: RecurrenceRule = { freq, interval };
  if (freq === 'WEEKLY') rule.byDay = days;
  if (freq === 'MONTHLY') {
    if (monthlyMode === 'day') rule.byMonthDay = date.getDate();
    else rule.byNthDay = { n: monthlyMode === 'last' ? -1 : nthOfMonth(date), day: own };
  }
  if (ends === 'after') rule.count = count;
  // An end before the start would leave nothing — clamp it to the start.
  if (ends === 'on') rule.until = until < dateKey(date) ? dateKey(date) : until;

  const upcoming = nextDates(rule, date, date, 3);

  function toggleDay(day: Weekday) {
    setDays((current) => {
      if (current.includes(day)) return current.length > 1 ? current.filter((d) => d !== day) : current;
      return [...current, day];
    });
  }

  return (
    <div className={styles.fullSheet} role="dialog" aria-modal="true" aria-labelledby="custom-repeat-title">
      <header className={styles.fullHeader}>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Cancel">
          <X size={20} strokeWidth={2} />
        </button>
        <h2 id="custom-repeat-title" className={styles.fullTitle}>
          Custom repeat
        </h2>
        <button type="button" className={styles.doneButton} onClick={() => onDone(rule)}>
          Done
        </button>
      </header>

      <div className={styles.fullBody}>
        {/* 1. every */}
        <section className={cardFormStyles.card}>
          <span className={cardFormStyles.label}>Repeat every</span>
          <div className={styles.everyRow}>
            <Stepper value={interval} min={1} max={99} onChange={setIntervalValue} label="interval" />
            <label className={styles.unitSelect}>
              <select value={freq} onChange={(event) => setFreq(event.target.value as Freq)} aria-label="Unit">
                {UNITS.map((u) => (
                  <option key={u.freq} value={u.freq}>
                    {interval === 1 ? u.one : u.many}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
            </label>
          </div>
        </section>

        {/* 2. weekdays */}
        {freq === 'WEEKLY' && (
          <section className={cardFormStyles.card}>
            <span className={cardFormStyles.label}>Repeat on</span>
            <div className={styles.dayChips} role="group" aria-label="Repeat on">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={styles.dayChip}
                  aria-pressed={days.includes(day)}
                  aria-label={DAY_NAMES[day]}
                  onClick={() => toggleDay(day)}
                >
                  {DAY_LETTER[day]}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 3. monthly */}
        {freq === 'MONTHLY' && (
          <section className={cardFormStyles.card}>
            <span className={cardFormStyles.label}>Monthly on</span>
            <div className={styles.radios} role="radiogroup" aria-label="Monthly on">
              <Radio checked={monthlyMode === 'day'} onSelect={() => setMonthly('day')}>
                On day {date.getDate()}
              </Radio>
              <Radio checked={monthlyMode === 'nth'} onSelect={() => setMonthly('nth')}>
                On the {ORDINALS[nthOfMonth(date)]} {DAY_NAMES[own]}
              </Radio>
              {lastOption && (
                <Radio checked={monthlyMode === 'last'} onSelect={() => setMonthly('last')}>
                  On the last {DAY_NAMES[own]}
                </Radio>
              )}
            </div>
          </section>
        )}

        {/* 4. ends */}
        <section className={cardFormStyles.card}>
          <span className={cardFormStyles.label}>Ends</span>
          <div className={styles.radios} role="radiogroup" aria-label="Ends">
            <Radio checked={ends === 'never'} onSelect={() => setEnds('never')}>
              Never
            </Radio>
            <Radio checked={ends === 'on'} onSelect={() => setEnds('on')}>
              On
              <input
                type="date"
                className={styles.inlineDate}
                value={until}
                min={dateKey(date)}
                onChange={(event) => {
                  if (event.target.value) setUntil(event.target.value);
                  setEnds('on');
                }}
                aria-label="End date"
              />
            </Radio>
            <Radio checked={ends === 'after'} onSelect={() => setEnds('after')}>
              After
              <span onClick={() => setEnds('after')}>
                <Stepper value={count} min={1} max={999} onChange={setCount} label="occurrences" />
              </span>
              {count === 1 ? 'occurrence' : 'occurrences'}
            </Radio>
          </div>
        </section>

        <section className={styles.summary} aria-live="polite">
          <p className={styles.summaryText}>{describeRule(rule, date)}</p>
          <p className={styles.summaryNext}>
            {upcoming.length > 0 ? `Next: ${upcoming.map(shortDay).join(', ')}` : 'No dates'}
          </p>
        </section>
      </div>
    </div>
  );
}

function Radio({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.radio} data-checked={checked || undefined}>
      <button type="button" role="radio" aria-checked={checked} className={styles.radioDot} onClick={onSelect} />
      <span className={styles.radioText} onClick={onSelect}>
        {children}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

const SCOPE_TEXT: Record<EditScope, { label: string; hint: string }> = {
  this: { label: 'This task', hint: 'Only this date' },
  following: { label: 'This and following tasks', hint: 'This date and every one after it' },
  all: { label: 'All tasks', hint: 'Every date — done ones stay done' },
};

export function ScopeSheet({
  sheet,
  onChoose,
  onClose,
}: {
  sheet: ScopeSheetState;
  onChoose: (scope: EditScope) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={sheet.action === 'delete' ? 'Delete recurring task' : 'Save recurring task'} onClose={onClose}>
      <div className={cardFormStyles.sheetList}>
        {sheet.options.map((scope) => (
          <button
            key={scope}
            type="button"
            className={`${cardFormStyles.sheetOption} ${cardFormStyles.sheetOptionStacked}`}
            onClick={() => onChoose(scope)}
          >
            <span className={cardFormStyles.sheetOptionName}>{SCOPE_TEXT[scope].label}</span>
            <span className={cardFormStyles.sheetOptionHint}>{SCOPE_TEXT[scope].hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function ConflictSheet({
  sheet,
  onSkip,
  onChangeTime,
}: {
  sheet: ConflictSheetState;
  onSkip: () => void;
  onChangeTime: () => void;
}) {
  const [open, setOpen] = useState(false);
  const n = sheet.conflicts.length;
  const allClash = n === sheet.total;
  return (
    <Modal title="Time conflicts" onClose={onChangeTime}>
      <p className={styles.conflictLead}>
        {n} of {sheet.total} {sheet.total === 1 ? 'occurrence conflicts' : 'occurrences conflict'} with blocked tasks
      </p>
      <button type="button" className={styles.expand} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide dates' : 'See dates'}
        <ChevronDown size={18} strokeWidth={2} className={styles.expandIcon} aria-hidden />
      </button>
      {open && (
        <ul className={styles.conflictList}>
          {sheet.conflicts.map((c: OccurrenceCheck) => (
            <li key={c.start.getTime()}>
              <span className={styles.conflictDate}>
                {shortDay(c.start)}, {hhmm(c.start)}
              </span>
              <span className={styles.conflictWith}>
                {c.clashWith
                  ? `${c.clashWith.title} ${hhmm(c.clashWith.start!)} to ${hhmm(c.clashWith.end!)}${c.clashWith.source === 'google' ? ' (Google Calendar)' : ''}`
                  : 'Busy'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.sheetActions}>
        {!allClash && (
          <button type="button" className={cardFormStyles.primary} onClick={onSkip}>
            Skip conflicting dates
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={onChangeTime}>
          Change time
        </button>
      </div>
    </Modal>
  );
}
