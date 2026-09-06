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
/**
 * Does `rule` apply to (year, month), and if so what occurrence number is
 * it, and how many times does it land that month? Returns null when the
 * rule hasn't started, has ended, or simply doesn't land in that month.
 */
export declare function ruleAppliesToMonth(rule: RecurrenceRule, year: number, month: number): MonthOccurrence | null;
/**
 * Next occurrence on or after `from`, no later than `until`. Walks
 * occurrences forward from the rule's own AnchorDate (occurrence 0, 1, 2,
 * ...) rather than reusing ruleAppliesToMonth, since this needs an actual
 * calendar date, not just "does this land somewhere in this month".
 */
export declare function nextOccurrenceOnOrAfter(rule: RecurrenceRule, from: Date, until: Date): Date | null;
/**
 * A rule's budgeted figure for one specific month, honoring a per-month
 * override when one exists — the "edit this month only, leave every other
 * month alone" feature. `monthOverrides` is keyed the same way
 * `excludedMonths` (FirestoreBudgetRule) already is: a plain yyyy-MM
 * string. Falls back to the ordinary `budgetedAmount * multiplier` (the
 * value `ruleAppliesToMonth`'s own MonthOccurrence.multiplier already
 * scales for a Weekly rule landing more than once in the month) when this
 * month has no override.
 */
export declare function effectiveBudgetedAmount(budgetedAmount: number, multiplier: number, monthOverrides: Record<string, {
    budgetedAmount: number;
}> | null | undefined, monthStr: string): number;
