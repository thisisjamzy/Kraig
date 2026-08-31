"use strict";
// users/{uid}/statsBudgetProgress/{yyyy-mm} maintenance (PRD-FIREBASE.md
// section 6), shared between onTransactionWrite (a category's spend
// changed) and onBudgetRuleWrite (a rule's own fields changed) — both are
// named in the PRD as inputs that recompute this. The document at
// users/{uid}/statsBudgetProgress/{month} holds one top-level field per
// ruleId: `{budgeted, spent, remaining, count}`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.recomputeRuleEntry = recomputeRuleEntry;
exports.recomputeRulesForCategory = recomputeRulesForCategory;
const firestore_1 = require("firebase-admin/firestore");
const shared_recurrence_1 = require("@kraig/shared-recurrence");
const firestore_2 = require("./firestore");
function toRecurrenceRule(rule) {
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
async function recomputeRuleEntry(uid, ruleId, rule, month) {
    const progressRef = firestore_2.db.collection('users').doc(uid).collection('statsBudgetProgress').doc(month);
    if (rule.archived || !rule.categoryId) {
        await progressRef.set({ [ruleId]: firestore_1.FieldValue.delete() }, { merge: true });
        return;
    }
    const [year, monthNum] = month.split('-').map(Number);
    const occurrence = (0, shared_recurrence_1.ruleAppliesToMonth)(toRecurrenceRule(rule), year, monthNum);
    const excludedMonths = rule.excludedMonths;
    if (!occurrence || excludedMonths?.includes(month)) {
        await progressRef.set({ [ruleId]: firestore_1.FieldValue.delete() }, { merge: true });
        return;
    }
    const monthlyData = (await firestore_2.db.collection('users').doc(uid).collection('statsMonthly').doc(month).get()).data();
    const spent = monthlyData?.perCategorySpend?.[rule.categoryId] || 0;
    const count = monthlyData?.perCategoryCount?.[rule.categoryId] || 0;
    const budgeted = (Number(rule.budgetedAmount) || 0) * occurrence.multiplier;
    await progressRef.set({ [ruleId]: { budgeted, spent, remaining: budgeted - spent, count } }, { merge: true });
}
/** Every active rule covering `categoryId` (within `uid`'s own subtree),
 * recomputed for `month` — called by onTransactionWrite whenever a
 * category's spend for a month changes. */
async function recomputeRulesForCategory(uid, categoryId, month) {
    const rulesSnap = await firestore_2.db
        .collection('users')
        .doc(uid)
        .collection('budgetRules')
        .where('categoryId', '==', categoryId)
        .where('archived', '==', false)
        .get();
    await Promise.all(rulesSnap.docs.map((doc) => recomputeRuleEntry(uid, doc.id, doc.data(), month)));
}
//# sourceMappingURL=budgetProgress.js.map