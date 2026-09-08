'use client';

// A tap-to-open calendar popover built on @heroui/react's DatePicker +
// Calendar compound components (react-aria-components underneath, same
// library CategoryTransactionsScreen's Select/ListBox already uses in this
// app — see that screen for the established Trigger/Popover precedent).
// Every date field elsewhere in the app is a plain `yyyy-MM-dd` string
// (src/logic/addTransaction/useLogic.ts's dateValue, todayIso()), while
// HeroUI's DatePicker works with @internationalized/date's CalendarDate —
// this wrapper converts at the boundary so callers never touch CalendarDate.
//
// The trigger deliberately shows a caller-supplied label (e.g. "Change"),
// not an editable segmented date input — this is a phone-first PWA where
// tapping to open the calendar and tapping a day is the whole interaction,
// same as the hand-rolled modal this replaces.

import { DatePicker, Calendar } from '@heroui/react';
import { parseDate, type CalendarDate } from '@internationalized/date';

export interface HeroDatePickerProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  triggerLabel: string;
  triggerClassName?: string;
  'aria-label'?: string;
}

export function HeroDatePicker({ value, onChange, triggerLabel, triggerClassName, ...rest }: HeroDatePickerProps) {
  const calendarValue = value ? parseDate(value) : null;

  function handleChange(next: CalendarDate | null) {
    if (next) onChange(next.toString());
  }

  return (
    <DatePicker.Root value={calendarValue} onChange={handleChange} granularity="day">
      <DatePicker.Trigger className={triggerClassName} aria-label={rest['aria-label']}>
        {triggerLabel}
      </DatePicker.Trigger>
      <DatePicker.Popover>
        <Calendar.Root>
          <Calendar.Header>
            <Calendar.NavButton slot="previous" aria-label="Previous month" />
            <Calendar.Heading />
            <Calendar.NavButton slot="next" aria-label="Next month" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
        </Calendar.Root>
      </DatePicker.Popover>
    </DatePicker.Root>
  );
}
