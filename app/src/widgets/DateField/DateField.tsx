'use client';

// A single-date picker (react-datepicker: https://reactdatepicker.com/) in
// the same label-left/value-right row style as TimeField — opened as a
// portal-rendered modal (withPortal) rather than an inline popper, so it
// can never get clipped by a scrolling form or the app's own mobile-width
// frame, which we can't pixel-check without a live browser here.

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './DateField.module.css';

function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// react-datepicker clones this element, injecting its own `value` (already
// formatted per `dateFormat` below) and `onClick` to open the calendar —
// this only needs to lay those out, not compute them itself.
function RowInput({
  id,
  label,
  value,
  onClick,
  ref,
}: {
  id?: string;
  label: string;
  value?: string;
  onClick?: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button type="button" id={id} ref={ref} className={styles.row} onClick={onClick}>
      <span className={styles.label}>{label}</span>
      <span className={value ? styles.value : styles.placeholder}>{value || 'Select date'}</span>
    </button>
  );
}

export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string; // "YYYY-MM-DD", or '' when unset
  onChange: (value: string) => void;
}) {
  const selected = parseDateOnly(value);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => onChange(date ? formatDateOnly(date) : '')}
      dateFormat="MMM dd, yyyy"
      withPortal
      customInput={<RowInput id={id} label={label} />}
    />
  );
}
