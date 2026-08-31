// Converts a FirestoreBudgetRule's or FirestorePlannedPayment's Timestamp
// fields into the plain-Date shape @dreda/shared-recurrence's
// ruleAppliesToMonth/nextOccurrenceOnOrAfter expect — both share the same
// recurrence fields, so one structural type covers either. Shared by every
// client-side call site that reads either collection directly
// (src/logic/budget, src/shared/firestore/upcomingPayments,
// src/shared/firestore/aggregation).

import type { RecurrenceRule } from '@dreda/shared-recurrence';
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
