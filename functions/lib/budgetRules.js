"use strict";
// onBudgetRuleWrite — PRD-FIREBASE.md section 6. When a rule's
// budgetedAmount, recurrence fields, or archived flag change, recompute
// that rule's own entry in stats/budgetProgress for the current month.
// Past, closed months are deliberately not touched — a rule change should
// not rewrite history. (Future months are the "optional" pre-generation
// PRD-FIREBASE.md mentions; not done here, the current month is what every
// screen actually reads.)
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBudgetRuleWrite = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firestore_3 = require("./lib/firestore");
const budgetProgress_1 = require("./lib/budgetProgress");
function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
exports.onBudgetRuleWrite = (0, firestore_1.onDocumentWritten)('users/{uid}/budgetRules/{ruleId}', async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const ruleId = event.params.ruleId;
    const month = currentMonth();
    if (!after) {
        // Hard delete (rare — the app archives in place instead, same
        // convention as sheets/Code.gs's deleteBudgetRule_). Nothing to look up
        // on the rule itself, so just clear whatever entry it had this month.
        await firestore_3.db
            .collection('users')
            .doc(uid)
            .collection('statsBudgetProgress')
            .doc(month)
            .set({ [ruleId]: firestore_2.FieldValue.delete() }, { merge: true });
        return;
    }
    await (0, budgetProgress_1.recomputeRuleEntry)(uid, ruleId, after, month);
});
//# sourceMappingURL=budgetRules.js.map