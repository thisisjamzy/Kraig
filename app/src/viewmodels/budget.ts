import type { Frequency, EndCondition } from '@/src/shared/firestore/types';

export type Recurrence = 'monthly' | 'limited' | 'once';

// Default month/year the Budget screen opens on — just which plan you're
// viewing, independent of the app's real current date.
export function currentMonthIndex() {
  return new Date().getMonth();
}
export function currentYear() {
  return new Date().getFullYear();
}

// Shared by src/logic/budget and src/logic/paymentsCalendar — both offer
// the same 3-choice recurrence picker (budget items and planned payments
// use the same FirestoreBudgetRule/FirestorePlannedPayment recurrence
// shape), converts it to the underlying Frequency/EndCondition fields.
export function toFrequencyFields(
  recurrence: Recurrence,
  recurrenceMonths: string
): { frequency: Frequency; endCondition: EndCondition; endOccurrences: number | null } {
  return {
    frequency: recurrence === 'once' ? 'Once' : 'Monthly',
    endCondition: recurrence === 'limited' ? 'After Occurrences' : 'Never',
    endOccurrences: recurrence === 'limited' ? Number(recurrenceMonths) || 1 : null,
  };
}
