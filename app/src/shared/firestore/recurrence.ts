// Converts a FirestoreBudgetRule's or FirestorePlannedPayment's Timestamp
// fields into the plain-Date shape @dreda/shared-recurrence's
// ruleAppliesToMonth/nextOccurrenceOnOrAfter expect — both share the same
// recurrence fields, so one structural type covers either. Shared by every
// client-side call site that reads either collection directly
// (src/logic/budget, src/shared/firestore/upcomingPayments,
// src/shared/firestore/aggregation).

import { ruleAppliesToMonth, type RecurrenceRule, type MonthOccurrence } from '@dreda/shared-recurrence';
import type { Timestamp } from 'firebase/firestore';
import type { Frequency, EndCondition } from './types';

interface HasRecurrenceFields {
  frequency: Frequency;
  interval: number;
  anchorDate: Timestamp;
  endCondition: EndCondition;
  endOccurrences: number | null;
  endDate: Timestamp | null;
}

export function toRecurrenceRule(rule: HasRecurrenceFields): RecurrenceRule {
  return {
    frequency: rule.frequency,
    interval: rule.interval ?? 1,
    anchorDate: rule.anchorDate.toDate(),
    endCondition: rule.endCondition ?? 'Never',
    endOccurrences: rule.endOccurrences ?? null,
    endDate: rule.endDate ? rule.endDate.toDate() : null,
  };
}

// A goal line item "applies" to a month the same way a recurring budget
// rule does — Fixed items repeat via their own recurrence, a Variable (or
// unspecified-recurrence) item is a single occurrence on its own dueDate.
// Shared by every place that needs to know "is this goal item part of this
// category's plan for month X" (src/logic/goals/useLogic.ts's dashboard
// cards, src/logic/budget/useLogic.ts and src/logic/categoryTransactions/
// useLogic.ts's own per-category Dedicated figure) — one definition so
// they can never quietly drift apart on what "applies to this month" means.
export function goalLineItemAppliesToMonth(
  item: { dueDate: Timestamp | null; recurrence?: { frequency: Frequency; interval: number } | null },
  year: number,
  month: number // 1-based, same convention ruleAppliesToMonth already uses
): MonthOccurrence | null {
  if (!item.dueDate) return null;
  return ruleAppliesToMonth(
    {
      frequency: item.recurrence?.frequency ?? 'Once',
      interval: item.recurrence?.interval ?? 1,
      anchorDate: item.dueDate.toDate(),
      endCondition: 'Never',
    },
    year,
    month
  );
}
