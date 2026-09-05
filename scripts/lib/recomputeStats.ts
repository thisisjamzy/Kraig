// Recomputes every materialized Firestore collection (accounts.currentBalance,
// statsMonthly/*, stats/home, statsBudgetProgress/{currentMonth}) from
// scratch, directly from whatever transactions/transfers/budgetRules
// actually exist right now under a specific user's own subtree — real data
// and any dummy_* seed data together. Never relies on the live Cloud
// Function triggers (functions/src/transactions.ts etc.) having run; a full
// recompute here is correct whether or not functions are deployed yet.
// Used by both scripts/seed-dummy-data.ts (after writing new dummy rows)
// and scripts/unseed-dummy-data.ts (after removing them) — same operation
// either way, "make every materialized doc agree with the source rows that
// are actually still there."
//
// Every ledger collection is a subcollection of users/{uid} now — no more
// top-level accounts/transactions/etc. (see refs.ts's and firestore.rules'
// headers, each account's data is private) — that's why this takes `uid`
// explicitly rather than operating on "everything" the way it used to.

import { ruleAppliesToMonth, type RecurrenceRule } from '@dreda/shared-recurrence';
import { db, Timestamp, type DocumentData } from './adminApp';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

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

export async function recomputeEverything(bulkWriter: FirebaseFirestore.BulkWriter, uid: string) {
  const userDoc = db.collection('users').doc(uid);
  const [txSnap, trSnap, accountsSnap, settingsSnap, ratesSnap, rulesSnap] = await Promise.all([
    userDoc.collection('transactions').get(),
    userDoc.collection('transfers').get(),
    userDoc.collection('accounts').get(),
    userDoc.collection('settings').doc('app').get(),
    userDoc.collection('exchangeRates').get(),
    userDoc.collection('budgetRules').where('archived', '==', false).get(),
  ]);

  const defaultCurrency = (settingsSnap.data()?.defaultCurrency as string) || 'XAF';
  const rates: Record<string, number> = {};
  ratesSnap.forEach((doc) => {
    const r = doc.data().rateToBase;
    if (typeof r === 'number') rates[doc.id] = r;
  });
  const accountCurrency = new Map<string, string>(
    accountsSnap.docs.map((doc) => [doc.id, doc.data().currency as string])
  );
  function convert(amount: number, from: string) {
    if (!from || from === defaultCurrency) return amount;
    const rFrom = rates[from];
    const rTo = rates[defaultCurrency];
    if (rFrom == null || rTo == null) return amount;
    return (amount * rFrom) / rTo;
  }

  // Account balances (native currency)
  const balanceDeltas = new Map<string, number>();
  for (const doc of txSnap.docs) {
    const t = doc.data();
    balanceDeltas.set(t.accountId, (balanceDeltas.get(t.accountId) ?? 0) + (t.signedAmount ?? 0));
  }
  for (const doc of trSnap.docs) {
    const t = doc.data();
    // fromAccountId pays the transfer amount AND its own charges (a wire
    // fee, a mobile-money charge); toAccountId only ever receives `amount`
    // — same split as aggregation.ts's createTransferWithAggregation, which
    // this recompute has to match exactly or a charged transfer leaves
    // that account's recomputed balance permanently `charges` too high.
    const charges = t.charges ?? 0;
    balanceDeltas.set(t.fromAccountId, (balanceDeltas.get(t.fromAccountId) ?? 0) - (t.amount + charges));
    balanceDeltas.set(t.toAccountId, (balanceDeltas.get(t.toAccountId) ?? 0) + t.amount);
  }
  for (const doc of accountsSnap.docs) {
    const startingBalance = doc.data().startingBalance ?? 0;
    bulkWriter.update(doc.ref, { currentBalance: startingBalance + (balanceDeltas.get(doc.id) ?? 0) });
  }

  // statsMonthly (converted to defaultCurrency) — one doc per month touched
  interface MonthAgg {
    totalIncome: number;
    totalExpense: number;
    transactionCount: number;
    perCategorySpend: Record<string, number>;
    perCategoryCount: Record<string, number>;
  }
  const months = new Map<string, MonthAgg>();
  function monthAgg(month: string): MonthAgg {
    let agg = months.get(month);
    if (!agg) {
      agg = { totalIncome: 0, totalExpense: 0, transactionCount: 0, perCategorySpend: {}, perCategoryCount: {} };
      months.set(month, agg);
    }
    return agg;
  }
  for (const doc of txSnap.docs) {
    const t = doc.data();
    const native = accountCurrency.get(t.accountId) ?? defaultCurrency;
    const convertedAmount = convert(t.amount, native);
    const month = t.month || monthKey((t.date as FirebaseFirestore.Timestamp).toDate());
    const agg = monthAgg(month);
    agg.transactionCount++;
    if (t.direction === 'Inflow') {
      agg.totalIncome += convertedAmount;
    } else {
      agg.totalExpense += convertedAmount;
      if (t.categoryId) {
        agg.perCategorySpend[t.categoryId] = (agg.perCategorySpend[t.categoryId] ?? 0) + convertedAmount;
      }
    }
    if (t.categoryId) {
      agg.perCategoryCount[t.categoryId] = (agg.perCategoryCount[t.categoryId] ?? 0) + 1;
    }
  }
  for (const [month, agg] of months) {
    bulkWriter.set(userDoc.collection('statsMonthly').doc(month), {
      totalIncome: Math.round(agg.totalIncome * 100) / 100,
      totalExpense: Math.round(agg.totalExpense * 100) / 100,
      transactionCount: agg.transactionCount,
      perCategorySpend: agg.perCategorySpend,
      perCategoryCount: agg.perCategoryCount,
      lastUpdated: Timestamp.now(),
    });
  }

  // stats/home
  const totalBalanceBase = accountsSnap.docs.reduce((sum, doc) => {
    const startingBalance = doc.data().startingBalance ?? 0;
    const currentBalance = startingBalance + (balanceDeltas.get(doc.id) ?? 0);
    return sum + convert(currentBalance, doc.data().currency ?? defaultCurrency);
  }, 0);
  const now = new Date();
  const currentMonth = monthKey(now);
  const currentAgg = months.get(currentMonth);
  bulkWriter.set(userDoc.collection('stats').doc('home'), {
    totalBalanceBase: Math.round(totalBalanceBase * 100) / 100,
    thisMonthIncome: Math.round((currentAgg?.totalIncome ?? 0) * 100) / 100,
    thisMonthExpense: Math.round((currentAgg?.totalExpense ?? 0) * 100) / 100,
    lastUpdated: Timestamp.now(),
  });

  // statsBudgetProgress/{currentMonth} — every active rule that applies this month
  const [year, monthNum] = currentMonth.split('-').map(Number);
  const progress: Record<string, { budgeted: number; spent: number; remaining: number; count: number }> = {};
  for (const doc of rulesSnap.docs) {
    const rule = doc.data();
    if (!rule.categoryId) continue;
    const occurrence = ruleAppliesToMonth(toRecurrenceRule(rule), year, monthNum);
    const excludedMonths = rule.excludedMonths as string[] | undefined;
    if (!occurrence || excludedMonths?.includes(currentMonth)) continue;
    const budgeted = (Number(rule.budgetedAmount) || 0) * occurrence.multiplier;
    const spent = currentAgg?.perCategorySpend[rule.categoryId] ?? 0;
    const count = currentAgg?.perCategoryCount[rule.categoryId] ?? 0;
    progress[doc.id] = { budgeted, spent, remaining: budgeted - spent, count };
  }
  bulkWriter.set(userDoc.collection('statsBudgetProgress').doc(currentMonth), progress);

  console.log(
    `recomputed for uid ${uid}: ${accountsSnap.size} account balances, ${months.size} statsMonthly docs, stats/home, statsBudgetProgress/${currentMonth} (${Object.keys(progress).length} rules)`
  );
}
