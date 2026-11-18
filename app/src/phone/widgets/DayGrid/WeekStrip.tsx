'use client';

// The week over the phone's day grid (Dreda v1.0 67699): weekday, date and
// a dot when the day has items; the selected day on a lime tile.

import { dayFromIso, mondayOf, shiftDay } from '@/src/viewmodels/calendarItems';
import styles from '@/src/phone/widgets/DayGrid/WeekStrip.module.css';

export function WeekStrip({ selected, today, onPick, countOf }: { selected: string; today: string; onPick: (iso: string) => void; countOf: (iso: string) => number }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(mondayOf(selected), i));
  return (
    <div className={styles.strip} role="group" aria-label="Days">
      {days.map((iso) => {
        const d = dayFromIso(iso);
        const n = countOf(iso);
        return (
          <button key={iso} type="button" className={styles.day} aria-pressed={iso === selected} data-today={iso === today || undefined} onClick={() => onPick(iso)}>
            <span className={styles.name}>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className={styles.num}>{d.getDate()}</span>
            <span className={styles.dot} data-on={n > 0 || undefined} aria-label={n > 0 ? `${n} ${n === 1 ? 'item' : 'items'}` : undefined} />
          </button>
        );
      })}
    </div>
  );
}

/** A month of days, Monday first: tap a day to open it. */
export function MonthDays({ selected, today, onPick, countOf }: { selected: string; today: string; onPick: (iso: string) => void; countOf: (iso: string) => number }) {
  const d = dayFromIso(selected);
  const first = `${selected.slice(0, 8)}01`;
  const start = mondayOf(first);
  const month = d.getMonth();
  const cells: string[] = [];
  for (let iso = start; cells.length < 42; iso = shiftDay(iso, 1)) cells.push(iso);
  const weeks = cells.slice(0, dayFromIso(cells[35]).getMonth() === month ? 42 : 35);
  return (
    <div className={styles.month}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => (
        <span key={n} className={styles.name}>
          {n}
        </span>
      ))}
      {weeks.map((iso) => {
        const n = countOf(iso);
        return (
          <button
            key={iso}
            type="button"
            className={styles.day}
            aria-pressed={iso === selected}
            data-today={iso === today || undefined}
            data-outside={dayFromIso(iso).getMonth() !== month || undefined}
            onClick={() => onPick(iso)}
          >
            <span className={styles.num}>{dayFromIso(iso).getDate()}</span>
            <span className={styles.dot} data-on={n > 0 || undefined} aria-label={n > 0 ? `${n} ${n === 1 ? 'item' : 'items'}` : undefined} />
          </button>
        );
      })}
    </div>
  );
}
