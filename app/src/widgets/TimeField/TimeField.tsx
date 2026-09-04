'use client';

// Wraps timepicker-ui (https://timepicker-ui.vercel.app/) — a vanilla-JS/DOM
// widget, not a React component — so this owns its own lifecycle via a ref
// rather than trying to make it a controlled input. The library manages its
// own mounted input's displayed text directly; this only needs to read the
// confirmed value back out as this app's canonical 24-hour "HH:mm" string
// (matching <input type="time">'s own format, used everywhere else a task's
// time is stored) and push external value changes (seeding from an existing
// task, or a reschedule elsewhere) back into the picker.

import { useEffect, useRef } from 'react';
import { TimepickerUI } from 'timepicker-ui';
import 'timepicker-ui/index.css';
import styles from './TimeField.module.css';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "14:30" -> "02:30 PM" — the "HH:MM AM/PM" format TimepickerUI#setValue
 * expects when the clock is in 12-hour mode. */
function to12HourTimeString(value24: string): string {
  const [hStr, mStr] = value24.split(':');
  const h = Number(hStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${mStr} ${period}`;
}

/** The confirm event's 12-hour hour+period -> this app's canonical 24-hour "HH:mm". */
function to24HourValue(hour: string, minutes: string, period: string | undefined): string {
  let h = Number(hour) % 12;
  if ((period ?? '').toUpperCase() === 'PM') h += 12;
  return `${pad(h)}:${minutes.padStart(2, '0')}`;
}

export function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string; // 24-hour "HH:mm", or '' when unset
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<TimepickerUI | null>(null);
  // Always-current onChange behind a ref so the mount effect below (which
  // intentionally runs once) never closes over a stale callback. Written in
  // its own effect, not during render — refs are only ever meant to be
  // read/written outside of render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) return;
    const picker = new TimepickerUI(inputRef.current, {
      clock: { type: '12h' },
      ui: { theme: 'basic' },
    });
    picker.create();
    picker.on('confirm', (data) => {
      if (!data.hour || !data.minutes) return;
      onChangeRef.current(to24HourValue(data.hour, data.minutes, data.type));
    });
    pickerRef.current = picker;
    return () => {
      picker.destroy();
      pickerRef.current = null;
    };
  }, []);

  // Sync an externally-driven value (seeding from an existing task, or a
  // programmatic change elsewhere) into the picker's own display — this
  // also covers the initial seed, since effects run once after mount too.
  useEffect(() => {
    if (!pickerRef.current || !value) return;
    pickerRef.current.setValue(to12HourTimeString(value));
  }, [value]);

  return (
    <div className={styles.row}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.pickerHost}>
        <input ref={inputRef} id={id} type="text" readOnly className={styles.input} placeholder="Select time" />
      </div>
    </div>
  );
}
