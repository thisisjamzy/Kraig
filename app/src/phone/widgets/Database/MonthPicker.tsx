'use client';

// The month picker: one button showing the month ("October 2026 ▾"), never
// previous and next arrows. Its menu (a bottom sheet on phones) starts with
// "This month" and "Next month", then lists months grouped by year, newest
// first, each with small markers: the current month, months not reviewed
// yet, and months with overdue items.

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import styles from '@/src/phone/widgets/Database/Database.module.css';

export type MonthMarker = 'current' | 'unreviewed' | 'overdue';

const MARKER_LABEL: Record<MonthMarker, string> = { current: 'Now', unreviewed: 'Not reviewed', overdue: 'Overdue' };

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shift(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return key(new Date(y, m - 1 + delta, 1));
}
export function monthName(month: string, withYear = true) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
}

export function MonthPicker({
  value,
  onChange,
  markers,
  from,
  to,
}: {
  value: string;
  onChange: (month: string) => void;
  markers?: (month: string) => MonthMarker[];
  /** Earliest month offered (default: two years back). */
  from?: string;
  /** Latest month offered (default: six months ahead). */
  to?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = key(new Date());
  const months = useMemo(() => {
    const out: string[] = [];
    const last = to ?? shift(current, 6);
    const first = from ?? shift(current, -24);
    for (let m = last; m >= first; m = shift(m, -1)) out.push(m);
    return out;
  }, [from, to, current]);
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];

  function pick(month: string) {
    onChange(month);
    setAnchor(null);
  }

  return (
    <>
      <button type="button" className={styles.monthButton} aria-haspopup="dialog" onClick={(e) => setAnchor(e.currentTarget)}>
        {monthName(value)}
        <ChevronDown size={15} strokeWidth={2} aria-hidden />
      </button>
      {anchor && (
        <Popover anchor={anchor} label="Choose month" onClose={() => setAnchor(null)}>
          <div className={styles.menu}>
            <button type="button" className={styles.menuRow} data-row onClick={() => pick(current)}>
              This month
            </button>
            <button type="button" className={styles.menuRow} data-row onClick={() => pick(shift(current, 1))}>
              Next month
            </button>
            <hr className={styles.menuDivider} />
            <div className={styles.monthList}>
              {years.map((year) => (
                <div key={year}>
                  <p className={styles.monthYear}>{year}</p>
                  {months
                    .filter((m) => m.startsWith(year))
                    .map((m) => {
                      const marks = [...(m === current ? (['current'] as MonthMarker[]) : []), ...(markers?.(m) ?? []).filter((x) => x !== 'current')];
                      return (
                        <button key={m} type="button" className={styles.menuRow} data-row aria-pressed={m === value} onClick={() => pick(m)}>
                          {monthName(m, false)}
                          {marks.length > 0 && (
                            <span className={styles.monthMarkers}>
                              {marks.map((k) => (
                                <span key={k} className={styles.monthMarker} data-kind={k}>
                                  {MARKER_LABEL[k]}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
