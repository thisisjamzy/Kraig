'use client';

// The Calendar's Month view: square day cells with up to 3 items as
// one-line pills (time and title), then "+N more" (opens the day); today's
// number in a brand circle. Phones: a compact grid with dots; tapping a
// day lists its items below the grid.

import { useState } from 'react';
import { dayFromIso, isoDay, mondayOf, shiftDay, type CalItem } from '@/src/viewmodels/calendarItems';
import styles from './TimeCalendar.module.css';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function sorted(items: CalItem[]) {
  return [...items].sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
}

function clock(d: Date | null) {
  return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
}

export function MonthGrid({
  selected,
  today,
  itemsOn,
  onOpen,
  onDay,
  compact,
}: {
  selected: string;
  today: string;
  itemsOn: (iso: string) => CalItem[];
  onOpen: (item: CalItem) => void;
  /** "+N more" or the day number: open that day. */
  onDay: (iso: string) => void;
  compact: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const d = dayFromIso(selected);
  const first = isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
  const start = mondayOf(first);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((((dayFromIso(first).getDay() + 6) % 7) + daysInMonth) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => shiftDay(start, i));
  const shownDay = picked ?? selected;

  if (compact) {
    const list = sorted(itemsOn(shownDay));
    return (
      <div className={styles.monthCompact}>
        <div className={styles.monthGrid} data-compact>
          {WEEKDAYS.map((w) => (
            <span key={w} className={styles.monthWeekday}>
              {w.charAt(0)}
            </span>
          ))}
          {cells.map((iso) => {
            const n = itemsOn(iso).length;
            return (
              <button
                key={iso}
                type="button"
                className={styles.monthCellCompact}
                aria-pressed={iso === shownDay}
                data-outside={dayFromIso(iso).getMonth() !== d.getMonth() || undefined}
                data-today={iso === today || undefined}
                onClick={() => setPicked(iso)}
                aria-label={`${dayFromIso(iso).toDateString()}, ${n} ${n === 1 ? 'item' : 'items'}`}
              >
                <span className={styles.monthNum}>{dayFromIso(iso).getDate()}</span>
                <span className={styles.monthDots} aria-hidden>
                  {Array.from({ length: Math.min(3, n) }, (_, i) => (
                    <span key={i} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <section className={styles.monthDayList} aria-label="Items on this day">
          <h3>{dayFromIso(shownDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {list.length === 0 ? (
            <p className={styles.muted}>Nothing scheduled.</p>
          ) : (
            list.map((i) => (
              <button key={i.key} type="button" className={styles.slotRow} data-kind={i.kind} onClick={() => onOpen(i)}>
                <span className={styles.blockTime}>{i.allDay ? 'All day' : clock(i.start)}</span>
                <span className={styles.slotTitle}>
                  {i.kind === 'google' && <span className={styles.gBadge}>G</span>}
                  {i.title}
                </span>
              </button>
            ))
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={styles.monthGrid}>
      {WEEKDAYS.map((w) => (
        <span key={w} className={styles.monthWeekday}>
          {w}
        </span>
      ))}
      {cells.map((iso) => {
        const items = sorted(itemsOn(iso));
        return (
          <div key={iso} className={styles.monthCell} data-outside={dayFromIso(iso).getMonth() !== d.getMonth() || undefined} data-today={iso === today || undefined}>
            <button type="button" className={styles.monthNumButton} onClick={() => onDay(iso)} aria-label={`Open ${dayFromIso(iso).toDateString()}`}>
              <span className={styles.monthNum}>{dayFromIso(iso).getDate()}</span>
            </button>
            {items.slice(0, 3).map((i) => (
              <button key={i.key} type="button" className={styles.pill} data-kind={i.kind} data-done={i.done || undefined} title={i.title} onClick={() => onOpen(i)}>
                {i.kind === 'google' && <span className={styles.gBadge}>G</span>}
                {!i.allDay && i.start && <span className={styles.pillTime}>{clock(i.start)}</span>}
                <span className={styles.pillText}>{i.title}</span>
              </button>
            ))}
            {items.length > 3 && (
              <button type="button" className={styles.allDayMore} onClick={() => onDay(iso)}>
                +{items.length - 3} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
