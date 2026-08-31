// Budget rule recurrence math — the reason this project exists in its
// current shape at all (see PRD-FIREBASE.md section 5 and the note in
// section 11 about budget recurrence being "the whole reason this project
// started"). Ported 1:1 from sheets/Code.gs's ruleForMonth_,
// weeklyOccurrencesInMonth_, and nextRuleOccurrence_ (which had its own
// passing test suite there — see sheets/test/budgetsUpcoming.test.js, this
// port is exercised by this package's own equivalent tests).
//
// Two entry points, one per caller:
//   - ruleAppliesToMonth: "does this rule apply in (year, month), and what
//     occurrence number is it?" — the Budget screen's client-side "does
//     this apply this month" check, and the onBudgetRuleWrite trigger's
//     stats/budgetProgress maintenance.
//   - nextOccurrenceOnOrAfter: "what's the next real calendar date this
//     rule is due?" — Payments Calendar's data source.

export type Frequency = 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
export type EndCondition = 'Never' | 'After Occurrences' | 'On Date';

export interface RecurrenceRule {
  frequency: Frequency;
  interval?: number | null;
  anchorDate: Date;
  endCondition?: EndCondition | null;
  endOccurrences?: number | null;
  endDate?: Date | null;
}

export interface MonthOccurrence {
  /** 1-based: which repetition of the rule this month is. */
  occurrenceIndex: number;
  /** >1 only for a Weekly rule that lands more than once in the same month. */
  multiplier: number;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function withinEndCondition(rule: RecurrenceRule, occurrenceNumber: number, date: Date): boolean {
  if (rule.endCondition === 'After Occurrences' && rule.endOccurrences) {
    return occurrenceNumber <= rule.endOccurrences;
  }
  if (rule.endCondition === 'On Date' && rule.endDate) {
    return date <= rule.endDate;
  }
  return true;
}

function periodicOccurrencesInMonth(
  anchor: Date,
  stepDays: number,
  year: number,
  month: number
): MonthOccurrence | null {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let idx = 1;
  let count = 0;
  let firstIndex: number | null = null;
  let guard = 0;
  while (cursor <= monthEnd && guard < 3000) {
    if (cursor >= monthStart && cursor <= monthEnd) {
      count++;
      if (firstIndex === null) firstIndex = idx;
    }
    cursor = new Date(cursor.getTime() + stepDays * 24 * 3600 * 1000);
    idx++;
    guard++;
  }
  return count > 0 && firstIndex !== null ? { occurrenceIndex: firstIndex, multiplier: count } : null;
}

/**
 * Does `rule` apply to (year, month), and if so what occurrence number is
 * it, and how many times does it land that month? Returns null when the
 * rule hasn't started, has ended, or simply doesn't land in that month.
 */
export function ruleAppliesToMonth(rule: RecurrenceRule, year: number, month: number): MonthOccurrence | null {
  const anchor = rule.anchorDate;
  const anchorMonths = anchor.getFullYear() * 12 + anchor.getMonth();
  const targetMonths = year * 12 + (month - 1);
  if (targetMonths < anchorMonths) return null;

  const interval = Math.max(1, rule.interval || 1);
  let occ: MonthOccurrence | null = null;

  if (rule.frequency === 'Once') {
    occ = targetMonths === anchorMonths ? { occurrenceIndex: 1, multiplier: 1 } : null;
  } else if (rule.frequency === 'Monthly') {
    const diff = targetMonths - anchorMonths;
    occ = diff % interval === 0 ? { occurrenceIndex: diff / interval + 1, multiplier: 1 } : null;
  } else if (rule.frequency === 'Quarterly') {
    const step = interval * 3;
    const diff = targetMonths - anchorMonths;
    occ = diff % step === 0 ? { occurrenceIndex: diff / step + 1, multiplier: 1 } : null;
  } else if (rule.frequency === 'Yearly') {
    const step = interval * 12;
    const diff = targetMonths - anchorMonths;
    occ = diff % step === 0 ? { occurrenceIndex: diff / step + 1, multiplier: 1 } : null;
  } else if (rule.frequency === 'Weekly') {
    occ = periodicOccurrencesInMonth(anchor, interval * 7, year, month);
  } else if (rule.frequency === 'Daily') {
    occ = periodicOccurrencesInMonth(anchor, interval, year, month);
  }

  if (!occ) return null;
  const monthStart = new Date(year, month - 1, 1);
  if (!withinEndCondition(rule, occ.occurrenceIndex, monthStart)) return null;
  return occ;
}

/**
 * Next occurrence on or after `from`, no later than `until`. Walks
 * occurrences forward from the rule's own AnchorDate (occurrence 0, 1, 2,
 * ...) rather than reusing ruleAppliesToMonth, since this needs an actual
 * calendar date, not just "does this land somewhere in this month".
 */
export function nextOccurrenceOnOrAfter(rule: RecurrenceRule, from: Date, until: Date): Date | null {
  const anchor = stripTime(rule.anchorDate);
  const fromDay = stripTime(from);
  const interval = Math.max(1, rule.interval || 1);

  for (let occ = 0; occ < 600; occ++) {
    let candidate: Date;
    if (rule.frequency === 'Daily') {
      candidate = new Date(anchor.getTime() + occ * interval * 24 * 3600 * 1000);
    } else if (rule.frequency === 'Weekly') {
      candidate = new Date(anchor.getTime() + occ * interval * 7 * 24 * 3600 * 1000);
    } else if (rule.frequency === 'Once') {
      if (occ > 0) return null;
      candidate = anchor;
    } else {
      const stepMonths =
        rule.frequency === 'Monthly'
          ? interval
          : rule.frequency === 'Quarterly'
            ? interval * 3
            : rule.frequency === 'Yearly'
              ? interval * 12
              : null;
      if (stepMonths == null) return null; // unrecognized frequency, nothing to schedule
      candidate = new Date(anchor.getFullYear(), anchor.getMonth() + stepMonths * occ, anchor.getDate());
    }
    if (candidate > until) return null;

    const occurrenceNumber = occ + 1;
    if (!withinEndCondition(rule, occurrenceNumber, candidate)) return null;
    if (candidate >= fromDay) return candidate;
  }
  return null;
}
