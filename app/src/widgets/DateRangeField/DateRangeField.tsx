'use client';

// A date-RANGE picker (react-datepicker's selectsRange:
// https://reactdatepicker.com/) for a project's timeline (start date -> end
// date) — unlike a task's single day-bound date, a project genuinely spans
// a range. Same label-left/value-right row and portal-modal approach as
// DateField.

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './DateRangeField.module.css';

function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// react-datepicker clones this element, injecting its own `value` (the
// range already formatted as "MMM dd - MMM dd" per `dateFormat` below) and
// `onClick` to open the calendar.
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
      <span className={value ? styles.value : styles.placeholder}>{value || 'Select dates'}</span>
    </button>
  );
}

export function DateRangeField({
  id,
  label,
  startValue,
  endValue,
  onChange,
}: {
  id: string;
  label: string;
  startValue: string; // "YYYY-MM-DD", or '' when unset
  endValue: string; // "YYYY-MM-DD", or '' when unset
  onChange: (start: string, end: string) => void;
}) {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);

  return (
    <DatePicker
      selectsRange
      startDate={start}
      endDate={end}
      onChange={(dates) => {
        const [newStart, newEnd] = dates;
        onChange(newStart ? formatDateOnly(newStart) : '', newEnd ? formatDateOnly(newEnd) : '');
      }}
      dateFormat="MMM dd"
      withPortal
      customInput={<RowInput id={id} label={label} />}
    />
  );
}
