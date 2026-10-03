'use client';

// A date dropdown: the label ("Saturday, 3 October", "28 Sep to 4 Oct
// 2026") with a chevron, opening "Today", "Tomorrow" and "Yesterday"
// shortcuts over a mini calendar. On phones it opens as a bottom sheet
// (Popover does that below 768px).

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { shiftDay } from '@/src/viewmodels/calendarItems';
import { MiniCalendar } from './MiniCalendar';
import styles from './TimeCalendar.module.css';

export function DateDropdown({
  label,
  selected,
  today,
  onPick,
  hasItems,
  shortcuts = true,
  className,
}: {
  label: string;
  selected: string;
  today: string;
  onPick: (iso: string) => void;
  hasItems?: (iso: string) => boolean;
  shortcuts?: boolean;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (iso: string) => {
    onPick(iso);
    setAnchor(null);
  };
  return (
    <>
      <button type="button" className={className ?? styles.dateButton} aria-haspopup="dialog" onClick={(e) => setAnchor(e.currentTarget)}>
        <span>{label}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {anchor && (
        <Popover anchor={anchor} label="Choose a date" onClose={() => setAnchor(null)}>
          <div className={styles.dateMenu}>
            {shortcuts && (
              <div className={styles.dateShortcuts}>
                <button type="button" onClick={() => pick(today)}>
                  Today
                </button>
                <button type="button" onClick={() => pick(shiftDay(today, 1))}>
                  Tomorrow
                </button>
                <button type="button" onClick={() => pick(shiftDay(today, -1))}>
                  Yesterday
                </button>
              </div>
            )}
            <MiniCalendar selected={selected} today={today} onPick={pick} hasItems={hasItems} />
          </div>
        </Popover>
      )}
    </>
  );
}
