import { Timestamp } from 'firebase/firestore';
import type { Frequency, EndCondition } from '@/src/shared/firestore/types';

// 'until' is new — repeats every month same as 'monthly', but stops after a
// specific end month/year the user picks, rather than after a raw count of
// occurrences ('limited') or never ('monthly'). Maps to EndCondition
// 'On Date', the one value this app's UI never produced before.
export type Recurrence = 'monthly' | 'limited' | 'until' | 'once';

// Default month/year the Budget screen opens on — just which plan you're
// viewing, independent of the app's real current date.
export function currentMonthIndex() {
  return new Date().getMonth();
}
export function currentYear() {
  return new Date().getFullYear();
}

// Shared by src/logic/addBudgetCategory and src/logic/budget's own edit
// flow — both offer the same recurrence picker over a FirestoreBudgetRule,
// converts it to the underlying Frequency/EndCondition fields. `endMonth`
// is only consulted for 'until' — every other
// recurrence ignores them. ruleAppliesToMonth (@dreda/shared-recurrence)
// compares a browsed month's own 1st-of-month Date against `endDate` with
// `<=`, so the 1st of the chosen end month itself is the correct value to
// store for "this end month is still included, the one after is not".
export function toFrequencyFields(
  recurrence: Recurrence,
  recurrenceMonths: string,
  endMonth?: { monthIndex: number; year: number }
): { frequency: Frequency; endCondition: EndCondition; endOccurrences: number | null; endDate: Timestamp | null } {
  return {
    frequency: recurrence === 'once' ? 'Once' : 'Monthly',
    endCondition: recurrence === 'limited' ? 'After Occurrences' : recurrence === 'until' ? 'On Date' : 'Never',
    endOccurrences: recurrence === 'limited' ? Number(recurrenceMonths) || 1 : null,
    endDate:
      recurrence === 'until' && endMonth ? Timestamp.fromDate(new Date(endMonth.year, endMonth.monthIndex, 1)) : null,
  };
}
