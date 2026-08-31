// users/{uid}/statsBudgetProgress/{yyyy-mm} maintenance (PRD-FIREBASE.md
// section 6), shared between onTransactionWrite (a category's spend
// changed) and onBudgetRuleWrite (a rule's own fields changed) — both are
// named in the PRD as inputs that recompute this. The document at
// users/{uid}/statsBudgetProgress/{month} holds one top-level field per
// ruleId: `{budgeted, spent, remaining, count}`.

import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { ruleAppliesToMonth, type RecurrenceRule } from '@dreda/shared-recurrence';
import { db } from './firestore';

function toRecurrenceRule(rule: DocumentData): RecurrenceRule {
  return {
    frequency: rule.frequency,
    interval: rule.interval ?? 1,
    anchorDate: rule.anchorDate.toDate(),
    endCondition: rule.endCondition ?? 'Never',
    endOccurrences: rule.endOccurrences ?? null,
    endDate: rule.endDate ? rule.endDate.toDate() : null,
  };
}

/** Recomputes exactly one rule's entry for one month, from the rule's own
 * fields plus that category's current spend for the month
 * (users/{uid}/statsMonthly/{month}.perCategorySpend). Removes the entry
 * entirely if the rule is archived or doesn't apply to this month at all. */
export async function recomputeRuleEntry(uid: string, ruleId: string, rule: DocumentData, month: string): Promise<void> {
  const progressRef = db.collection('users').doc(uid).collection('statsBudgetProgress').doc(month);

  if (rule.archived || !rule.categoryId) {
    await progressRef.set({ [ruleId]: FieldValue.delete() }, { merge: true });
    return;
  }

  const [year, monthNum] = month.split('-').map(Number);
  const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year, monthNum);
  const excludedMonths = rule.excludedMonths as string[] | undefined;
  if (!occurrence || excludedMonths?.includes(month)) {
    await progressRef.set({ [ruleId]: FieldValue.delete() }, { merge: true });
    return;
  }

  const monthlyData = (await db.collection('users').doc(uid).collection('statsMonthly').doc(month).get()).data();
  const spent = (monthlyData?.perCategorySpend?.[rule.categoryId] as number | undefined) || 0;
  const count = (monthlyData?.perCategoryCount?.[rule.categoryId] as number | undefined) || 0;
  const budgeted = (Number(rule.budgetedAmount) || 0) * occurrence.multiplier;

  await progressRef.set(
    { [ruleId]: { budgeted, spent, remaining: budgeted - spent, count } },
    { merge: true }
  );
}

/** Every active rule covering `categoryId` (within `uid`'s own subtree),
 * recomputed for `month` — called by onTransactionWrite whenever a
 * category's spend for a month changes. */
export async function recomputeRulesForCategory(uid: string, categoryId: string, month: string): Promise<void> {
  const rulesSnap = await db
    .collection('users')
    .doc(uid)
    .collection('budgetRules')
    .where('categoryId', '==', categoryId)
    .where('archived', '==', false)
    .get();
  await Promise.all(rulesSnap.docs.map((doc) => recomputeRuleEntry(uid, doc.id, doc.data(), month)));
}
