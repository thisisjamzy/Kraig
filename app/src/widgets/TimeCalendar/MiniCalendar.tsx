'use client';

// The mini month calendar block (Today, the Calendar's left column, the
// date dropdowns): plain Notion style. The month name opens a month list;
// weekday initials; a small dot under days with items; today in a filled
// brand circle; the selected date in a light grey square. Clicking a day
// picks it.

import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { dayFromIso, isoDay } from '@/src/viewmodels/calendarItems';
import styles from './TimeCalendar.module.css';

const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-GB', { month: 'long' }));

function grid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + days) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => isoDay(new Date(year, month, 1 - lead + i)));
}

export function MiniCalendar({
  selected,
  today,
  onPick,
  hasItems,
  label = 'Month',
}: {
  selected: string;
  today: string;
  onPick: (iso: string) => void;
  /** Days with a dot. */
  hasItems?: (iso: string) => boolean;
  label?: string;
}) {
  const sel = dayFromIso(selected);
  const [cursor, setCursor] = useState({ y: sel.getFullYear(), m: sel.getMonth(), for: selected });
  // Follow the selected date when it moves to another month from outside.
  let c = cursor;
  if (cursor.for !== selected && (sel.getFullYear() !== cursor.y || sel.getMonth() !== cursor.m)) {
    c = { y: sel.getFullYear(), m: sel.getMonth(), for: selected };
    setCursor(c);
  }
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const shift = (d: number) => setCursor((x) => ({ y: x.m + d < 0 ? x.y - 1 : x.m + d > 11 ? x.y + 1 : x.y, m: (x.m + d + 12) % 12, for: x.for }));
  const cells = grid(c.y, c.m);

  return (
    <section className={styles.mini} aria-label={label}>
      <div className={styles.miniHead}>
        <button type="button" className={styles.miniMonth} onClick={(e) => setMenu(e.currentTarget)} aria-haspopup="listbox">
          {MONTHS[c.m]} {c.y}
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
        <span className={styles.miniNav}>
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </span>
      </div>
      <div className={styles.miniGrid} role="grid" aria-label={`${MONTHS[c.m]} ${c.y}`}>
        {INITIALS.map((d, i) => (
          <span key={i} className={styles.miniWeekday} aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((iso) => {
          const d = dayFromIso(iso);
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={styles.miniDay}
              aria-selected={iso === selected}
              aria-label={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              data-outside={d.getMonth() !== c.m || undefined}
              data-today={iso === today || undefined}
              onClick={() => onPick(iso)}
            >
              <span className={styles.miniNum}>{d.getDate()}</span>
              {hasItems?.(iso) && <span className={styles.miniDot} aria-hidden />}
            </button>
          );
        })}
      </div>
      {menu && (
        <Popover anchor={menu} label="Choose a month" onClose={() => setMenu(null)}>
          <div className={styles.monthMenu}>
            <div className={styles.monthMenuYear}>
              <button type="button" onClick={() => setCursor((x) => ({ ...x, y: x.y - 1 }))} aria-label="Previous year">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <span>{c.y}</span>
              <button type="button" onClick={() => setCursor((x) => ({ ...x, y: x.y + 1 }))} aria-label="Next year">
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
            <div className={styles.monthMenuGrid}>
              {MONTHS.map((name, m) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={m === c.m}
                  onClick={() => {
                    setCursor((x) => ({ ...x, m }));
                    setMenu(null);
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </section>
  );
}
