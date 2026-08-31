"use strict";
// onTransactionWrite — PRD-FIREBASE.md section 6, the highest-risk
// correctness surface in this whole migration. Three cases must all be
// handled, each a real correctness bug if missed: a plain amount edit, a
// delete, and an edit that moves a transaction to a different
// account/category/month.
//
// Watches users/{uid}/transactions/{transactionId} (every ledger collection
// is a subcollection of its own owner's users/{uid} doc — no household-wide
// sharing, see firestore.rules' header) — event.params.uid is threaded
// through every read/write below so this only ever touches that same uid's
// own accounts/statsMonthly/stats/statsBudgetProgress, never another
// account's.
//
// Design: rather than compute a clever per-field delta (easy to get subtly
// wrong across those three cases), this always fully REVERSES whatever
// `before` contributed, then fully APPLIES whatever `after` contributes.
// That's simpler to verify and provably correct in every case: create
// (before is null, nothing to reverse), delete (after is null, nothing to
// apply), an edit that doesn't move buckets (reverse-then-apply nets out to
// the same delta a diff would have produced), and a move to a different
// account/category/month (the old bucket is fully un-charged, the new one
// fully charged — no cross-contamination between them).
//
// signedAmount/month are never trusted from the client (PRD-FIREBASE.md
// section 5) — contributionOf recomputes both itself from amount/direction/
// date on every invocation, so the delta below is always correct regardless
// of what the document's own signedAmount/month fields currently say. Those
// two fields are then separately, idempotently corrected (self-corrected) in
// the SAME batch as the delta, purely so the document's own fields are
// accurate for direct reads/queries — never as a precondition for applying
// the delta. That correction's own write re-triggers this function once
// more; isPureFieldCorrection() recognizes that retrigger explicitly (same
// amount/direction/date/accountId/categoryId as just applied, only
// signedAmount/month differ) and returns immediately, never computing or
// applying a second delta.
//
// (An earlier version relied on that second invocation's before/after
// contributions simply cancelling out to zero, instead of skipping it
// outright. Two bugs came from that: first, applying the delta only on that
// second "settled" invocation and skipping the first — but since
// contributionOf always recomputes signedAmount/month fresh rather than
// reading the document's stored fields, that settle invocation's before and
// after were always identical too, silently applying a zero delta forever.
// After fixing that, a second bug surfaced against the local emulator: the
// retrigger's before/after cancellation isn't reliable to depend on at all —
// an observed run applied a second, non-cancelling delta on the retrigger,
// doubling every count. isPureFieldCorrection() sidesteps the whole question
// by never computing a delta for that invocation in the first place. Both
// caught by functions/src/integration/transactions.test.ts.)
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTransactionWrite = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firestore_3 = require("./lib/firestore");
const currency_1 = require("./lib/currency");
const budgetProgress_1 = require("./lib/budgetProgress");
function signedAmountOf(data) {
    const amount = Number(data.amount) || 0;
    return data.direction === 'Inflow' ? amount : -amount;
}
function monthOf(data) {
    const ts = data.date;
    if (!ts)
        return '';
    const date = ts.toDate();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function contributionOf(data) {
    if (!data || !data.accountId)
        return null;
    const month = monthOf(data);
    if (!month)
        return null;
    return {
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        month,
        signedAmount: signedAmountOf(data),
    };
}
/**
 * True when `before`/`after` differ only in the fields this trigger itself
 * writes back (signedAmount/month) — i.e. this invocation is purely the
 * retrigger from that self-correction, never a real business change.
 * Recognized explicitly and skipped outright, rather than trusting the
 * delta to net to zero on its own: a local-emulator run of this exact
 * scenario was observed applying a real, non-cancelling delta on the
 * retrigger (see functions/src/integration/transactions.test.ts), so
 * relying on before/after cancellation across two separate invocations is
 * not safe to assume.
 */
function isPureFieldCorrection(before, after) {
    const beforeDate = before.date;
    const afterDate = after.date;
    return (before.amount === after.amount &&
        before.direction === after.direction &&
        before.accountId === after.accountId &&
        (before.categoryId ?? null) === (after.categoryId ?? null) &&
        (beforeDate?.isEqual(afterDate) ?? beforeDate === afterDate));
}
exports.onTransactionWrite = (0, firestore_1.onDocumentWritten)('users/{uid}/transactions/{transactionId}', async (event) => {
    const uid = event.params.uid;
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    const before = beforeSnap?.exists ? beforeSnap.data() : undefined;
    const after = afterSnap?.exists ? afterSnap.data() : undefined;
    if (before && after && isPureFieldCorrection(before, after))
        return;
    const beforeContribution = contributionOf(before);
    const afterContribution = contributionOf(after);
    if (!beforeContribution && !afterContribution)
        return;
    const defaultCurrency = await (0, currency_1.getDefaultCurrency)(uid);
    const rates = await (0, currency_1.getExchangeRates)(uid);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const batch = firestore_3.db.batch();
    for (const [contribution, sign] of [
        [beforeContribution, -1],
        [afterContribution, 1],
    ]) {
        if (!contribution)
            continue;
        const currency = await (0, currency_1.currencyOfAccount)(uid, contribution.accountId, defaultCurrency);
        const nativeDelta = sign * contribution.signedAmount;
        const convertedDelta = (0, currency_1.convert)(nativeDelta, currency, defaultCurrency, rates);
        applyDelta(batch, uid, contribution, nativeDelta, convertedDelta, sign, currentMonth);
    }
    // Idempotent, and never a precondition for the delta above — just keeps
    // the document's own signedAmount/month fields accurate for direct reads.
    if (after && afterSnap && afterContribution) {
        if (after.signedAmount !== afterContribution.signedAmount || after.month !== afterContribution.month) {
            batch.update(afterSnap.ref, { signedAmount: afterContribution.signedAmount, month: afterContribution.month });
        }
    }
    await batch.commit();
    // stats/budgetProgress reads statsMonthly.perCategorySpend, so it has to
    // run after the batch above lands, not inside it — dedupe (categoryId,
    // month) pairs since before/after commonly share both.
    const categoryMonthPairs = new Map();
    for (const c of [beforeContribution, afterContribution]) {
        if (c?.categoryId)
            categoryMonthPairs.set(`${c.categoryId}::${c.month}`, { categoryId: c.categoryId, month: c.month });
    }
    await Promise.all([...categoryMonthPairs.values()].map(({ categoryId, month }) => (0, budgetProgress_1.recomputeRulesForCategory)(uid, categoryId, month)));
});
/**
 * One directed contribution (either "reverse the before" with a negative
 * sign already baked into nativeDelta/convertedDelta, or "apply the after"
 * with a positive one). Account balance moves by nativeDelta (the account's
 * own currency); every stats document moves by convertedDelta
 * (defaultCurrency, per PRD-FIREBASE.md section 8) — two different numbers,
 * passed in explicitly rather than derived from each other.
 */
function applyDelta(batch, uid, c, nativeDelta, convertedDelta, countDelta, currentMonth) {
    const userDoc = firestore_3.db.collection('users').doc(uid);
    batch.update(userDoc.collection('accounts').doc(c.accountId), {
        currentBalance: firestore_2.FieldValue.increment(nativeDelta),
    });
    const income = convertedDelta > 0 ? convertedDelta : 0;
    const expense = convertedDelta < 0 ? -convertedDelta : 0;
    const monthUpdate = {
        totalIncome: firestore_2.FieldValue.increment(income),
        totalExpense: firestore_2.FieldValue.increment(expense),
        transactionCount: firestore_2.FieldValue.increment(countDelta),
        lastUpdated: firestore_2.FieldValue.serverTimestamp(),
    };
    if (c.categoryId) {
        // A nested plain object, not a dotted string key ('perCategorySpend.' +
        // categoryId) — set(..., {merge: true}) only deep-merges genuine nested
        // objects; a dotted string key is stored as one literal top-level field
        // whose name contains a dot, never reaching the perCategorySpend map at
        // all (that's an .update()-only behavior). Caught by
        // functions/src/integration/transactions.test.ts.
        if (convertedDelta !== 0) {
            // Track net movement per category (can go negative on a full reversal),
            // not just expense — matches how a category's spend should unwind
            // exactly when a transaction is deleted or moved elsewhere.
            monthUpdate.perCategorySpend = { [c.categoryId]: firestore_2.FieldValue.increment(expense - income) };
        }
        monthUpdate.perCategoryCount = { [c.categoryId]: firestore_2.FieldValue.increment(countDelta) };
    }
    batch.set(userDoc.collection('statsMonthly').doc(c.month), monthUpdate, { merge: true });
    const homeUpdate = {
        totalBalanceBase: firestore_2.FieldValue.increment(convertedDelta),
        lastUpdated: firestore_2.FieldValue.serverTimestamp(),
    };
    if (c.month === currentMonth) {
        homeUpdate.thisMonthIncome = firestore_2.FieldValue.increment(income);
        homeUpdate.thisMonthExpense = firestore_2.FieldValue.increment(expense);
    }
    batch.set(userDoc.collection('stats').doc('home'), homeUpdate, { merge: true });
}
//# sourceMappingURL=transactions.js.map