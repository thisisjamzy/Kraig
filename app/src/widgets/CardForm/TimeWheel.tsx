'use client';

// An hours : minutes wheel — two scroll-snapping columns, the row under the
// center band is the value. Native scrolling (touch, wheel, trackpad) does
// the spinning; arrow keys step each column for keyboard users.

import { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import styles from './CardForm.module.css';

const ITEM_HEIGHT = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function Column({
  values,
  value,
  onChange,
  label,
  isLocked,
}: {
  values: number[];
  value: number;
  onChange: (next: number) => void;
  label: string;
  isLocked?: (v: number) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, values.indexOf(value));

  // Start on the current value (no animation on open).
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // Read the value once scrolling has settled on a snap point.
    settleTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const next = values[Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)))];
      if (next !== value) onChange(next);
    }, 90);
  }

  function step(delta: number) {
    const nextIndex = Math.max(0, Math.min(values.length - 1, index + delta));
    ref.current?.scrollTo({ top: nextIndex * ITEM_HEIGHT, behavior: 'smooth' });
    onChange(values[nextIndex]);
  }

  return (
    <div
      ref={ref}
      className={styles.wheelColumn}
      onScroll={onScroll}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuetext={pad(value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          step(-1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          step(1);
        }
      }}
    >
      {values.map((v) => {
        const locked = isLocked?.(v) ?? false;
        return (
          <div key={v} className={styles.wheelItem} data-selected={v === value || undefined} data-locked={locked || undefined}>
            {pad(v)}
            {locked && <Lock size={10} strokeWidth={2.5} className={styles.wheelLock} aria-label="inside a blocked task" />}
          </div>
        );
      })}
    </div>
  );
}

/** value/onChange are "HH:mm"; minutes snap to 5. `isLocked("HH:mm")`
 * greys out (with a lock) times inside a blocked task — still selectable,
 * the form's availability row will just show the conflict. */
export function TimeWheel({
  value,
  onChange,
  isLocked,
}: {
  value: string;
  onChange: (next: string) => void;
  isLocked?: (time: string) => boolean;
}) {
  const [h, m] = (value || '09:00').split(':').map(Number);
  const minute = MINUTES.includes(m) ? m : Math.round(m / 5) * 5 === 60 ? 55 : Math.round(m / 5) * 5;
  return (
    <div className={styles.wheel}>
      <div className={styles.wheelBand} aria-hidden />
      <Column
        values={HOURS}
        value={h}
        label="hours"
        onChange={(next) => onChange(`${pad(next)}:${pad(minute)}`)}
        isLocked={isLocked ? (hour) => isLocked(`${pad(hour)}:${pad(minute)}`) : undefined}
      />
      <span className={styles.wheelColon} aria-hidden>
        :
      </span>
      <Column
        values={MINUTES}
        value={minute}
        label="minutes"
        onChange={(next) => onChange(`${pad(h)}:${pad(next)}`)}
        isLocked={isLocked ? (m) => isLocked(`${pad(h)}:${pad(m)}`) : undefined}
      />
    </div>
  );
}
