'use client';

// A row of days above a day timeline: weekday, date and the number of
// items (blank when there are none). The selected day has a light grey
// background and a brand underline; today's number is in brand color.
// Phones: three weeks, scrolling sideways, the selected day in view.

import { useEffect, useRef } from 'react';
import { dayFromIso, mondayOf, shiftDay } from '@/src/viewmodels/calendarItems';
import styles from './TimeCalendar.module.css';

export function DayStrip({
  selected,
  today,
  onPick,
  countOf,
  scrollable = false,
}: {
  selected: string;
  today: string;
  onPick: (iso: string) => void;
  countOf: (iso: string) => number;
  scrollable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = scrollable ? shiftDay(mondayOf(selected), -7) : mondayOf(selected);
  const days = Array.from({ length: scrollable ? 21 : 7 }, (_, i) => shiftDay(start, i));

  useEffect(() => {
    if (!scrollable) return;
    const el = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selected, scrollable]);

  return (
    <div ref={ref} className={styles.strip} data-scroll={scrollable || undefined} role="group" aria-label="Days">
      {days.map((iso) => {
        const d = dayFromIso(iso);
        const n = countOf(iso);
        return (
          <button key={iso} type="button" className={styles.stripDay} aria-pressed={iso === selected} data-today={iso === today || undefined} onClick={() => onPick(iso)}>
            <span className={styles.stripName}>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className={styles.stripNum}>{d.getDate()}</span>
            <span className={styles.stripCount}>{n > 0 ? `${n} ${n === 1 ? 'item' : 'items'}` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
