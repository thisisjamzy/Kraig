/**
 * PRD-BUDGETS-V2.md section 7 — one-time migration from category budget
 * rules to bucket items. Idempotent (every id it writes is deterministic;
 * re-running skips work already done) and DRY-RUN BY DEFAULT: it prints what
 * it would do and writes nothing unless you pass --apply.
 *
 *   1. Every active budget rule → an item in a "Migrated budgets" bucket, one
 *      bucket per (Fixed|Planned) × type so each bucket's items share a type
 *      the way the bucket edit form expects. Recurrence, per-month skips and
 *      per-month overrides carry over; an end condition becomes
 *      recurrence.endDate. Rules that were auto-created FOR a goal item (or
 *      are pointed at by one's budgetRuleId) are skipped — that item already
 *      is the plan. Every rule is then archived (never deleted).
 *   2. Every goal item payment (payments[], or the legacy expenseId/
 *      transferId) → `bucketItem` on the transaction/transfer it recorded, so
 *      the new Budget screen can attribute that spend to the item-month.
 *   3. Fixed items marked completed → reopened (a recurring item is never
 *      "done"; the old flag hid it from every later month).
 *   4. Variable items "added to budget" with no due date → scheduled into the
 *      month they were added, so they stay in that month's budget.
 *
 * It also warns about categories that had BOTH a rule and goal items in the
 * same month: the old screen treated goal items as a slice of the rule's
 * figure ("dedicated"); after migration both are full items, so that month's
 * plan grows by the goal items' amount unless you trim the migrated item.
 *
 * Setup (same as the seed scripts):
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=...
 *   TARGET_UID=<uid> (or TARGET_EMAIL=<email>)
 *   npx tsx scripts/migrate-budgets-v2.ts           # dry run
 *   npx tsx scripts/migrate-budgets-v2.ts --apply   # write
 */

import { ruleAppliesToMonth } from '@dreda/shared-recurrence';
import { db, Timestamp, requireTargetUid, type DocumentData } from './lib/adminApp';
import { itemOccurrence, addMonths, monthKeyOf } from '../app/src/shared/budget/monthBudget';

const APPLY = process.argv.includes('--apply');
const TYPES = ['Expense', 'Income', 'Savings', 'Transfer'] as const;
const TRANSFER_KINDS = new Set(['Wallet to wallet', 'Wallet to savings', 'Savings to wallet']);

function convert(amount: number, from: string, to: string, rates: Record<string, number>) {
  if (!from || !to || from === to || rates[from] == null || rates[to] == null) return amount;
  return (amount * rates[from]) / rates[to];
}
const round2 = (n: number) => Math.round(n * 100) / 100;

function toRecurrenceRule(rule: DocumentData) {
  return {
    frequency: rule.frequency,
    interval: rule.interval ?? 1,
    anchorDate: rule.anchorDate.toDate(),
    endCondition: rule.endCondition ?? 'Never',
    endOccurrences: rule.endOccurrences ?? null,
    endDate: rule.endDate ? rule.endDate.toDate() : null,
  };
}

// A rule's end condition as a single end date (end of its last month), or
// null for "never ends". After-N-occurrences is walked month by month.
function ruleEndDate(rule: DocumentData): Date | null {
  if (rule.frequency === 'Once') return null;
  if (rule.endCondition === 'On Date' && rule.endDate) return rule.endDate.toDate();
  if (rule.endCondition !== 'After Occurrences' || !rule.endOccurrences) return null;
  const recurrence = toRecurrenceRule(rule);
  let month = monthKeyOf(recurrence.anchorDate);
  let seen = 0;
  for (let guard = 0; guard < 1200; guard++) {
    const [y, m] = month.split('-').map(Number);
    const occurrence = ruleAppliesToMonth({ ...recurrence, endCondition: 'Never', endDate: null }, y, m);
    if (occurrence) {
      seen += occurrence.multiplier;
      if (seen >= rule.endOccurrences) return new Date(y, m, 0, 23, 59, 59);
    }
    month = addMonths(month, 1);
  }
  return null;
}

async function main() {
  const uid = await requireTargetUid();
  const user = db.collection('users').doc(uid);
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} for users/${uid}\n`);

  const [settingsSnap, ratesSnap, accountsSnap, categoriesSnap, rulesSnap, goalsSnap] = await Promise.all([
    user.collection('settings').doc('app').get(),
    user.collection('exchangeRates').get(),
    user.collection('accounts').get(),
    user.collection('categories').get(),
    user.collection('budgetRules').where('archived', '==', false).get(),
    user.collection('goals').get(),
  ]);
  const base: string = settingsSnap.data()?.defaultCurrency ?? 'XAF';
  const rates = Object.fromEntries(ratesSnap.docs.map((d) => [d.id, d.data().rateToBase as number]));
  const accountCurrency = new Map(accountsSnap.docs.map((d) => [d.id, d.data().currency as string]));
  const categories = new Map(categoriesSnap.docs.map((d) => [d.id, d.data()]));

  const itemsByGoal = new Map<string, { id: string; data: DocumentData }[]>();
  for (const goal of goalsSnap.docs) {
    const items = await goal.ref.collection('lineItems').get();
    itemsByGoal.set(goal.id, items.docs.map((d) => ({ id: d.id, data: d.data() })));
  }
  const goalKind = new Map(goalsSnap.docs.map((d) => [d.id, d.data().kind === 'Fixed' ? 'Fixed' : 'Variable']));
  const goalArchived = new Map(goalsSnap.docs.map((d) => [d.id, Boolean(d.data().archived)]));
  const ruleIdsOwnedByItems = new Set<string>();
  for (const items of itemsByGoal.values()) {
    for (const item of items) if (item.data.budgetRuleId) ruleIdsOwnedByItems.add(item.data.budgetRuleId);
  }

  const writes: Array<() => Promise<unknown>> = [];
  const log = (line: string) => console.log(`  ${line}`);

  // --- 1. rules → items --------------------------------------------------
  console.log(`1. Budget rules → bucket items (${rulesSnap.size} active rules)`);
  const bucketsNeeded = new Map<string, { kind: 'Fixed' | 'Variable'; type: (typeof TYPES)[number] }>();
  const migratedItems: { bucketId: string; id: string; data: DocumentData }[] = [];
  let rank = Date.now();
  for (const ruleDoc of rulesSnap.docs) {
    const rule = ruleDoc.data();
    if (rule.sourceGoalLineItemId || ruleIdsOwnedByItems.has(ruleDoc.id)) {
      log(`skip ${ruleDoc.id} (owned by a goal item) → archive`);
      writes.push(() => ruleDoc.ref.update({ archived: true, migratedToItem: null, updatedAt: Timestamp.now() }));
      continue;
    }
    const type: (typeof TYPES)[number] =
      rule.type ?? (TRANSFER_KINDS.has(rule.categoryId) ? 'Transfer' : categories.get(rule.categoryId)?.transactionType ?? 'Expense');
    const kind = rule.frequency === 'Once' ? 'Variable' : 'Fixed';
    const bucketId = `migrated_${kind.toLowerCase()}_${type.toLowerCase()}`;
    bucketsNeeded.set(bucketId, { kind, type });
    const native = rule.accountId ? accountCurrency.get(rule.accountId) ?? base : base;
    const toBase = (amount: number) => round2(convert(Number(amount) || 0, native, base, rates));
    const endDate = ruleEndDate(rule);
    const itemId = `mig_${ruleDoc.id}`;
    const monthOverrides = Object.fromEntries(
      Object.entries((rule.monthOverrides ?? {}) as Record<string, { budgetedAmount: number }>).map(([month, value]) => [
        month,
        { amount: toBase(value.budgetedAmount) },
      ])
    );
    const data = {
      goalId: bucketId,
      name: rule.description || categories.get(rule.categoryId)?.name || rule.categoryId,
      description: `Migrated from budget rule ${ruleDoc.id}`,
      amount: toBase(rule.budgetedAmount),
      priority: 'Medium',
      necessity: 'MustHave',
      categoryId: rule.categoryId,
      accountId: rule.accountId ?? null,
      toAccountId: null,
      charges: null,
      dueDate: rule.anchorDate,
      recurrence:
        kind === 'Fixed'
          ? { frequency: rule.frequency, interval: rule.interval ?? 1, endDate: endDate ? Timestamp.fromDate(endDate) : null }
          : null,
      excludedMonths: rule.excludedMonths ?? [],
      monthOverrides,
      subItems: [],
      budgetRuleId: null,
      addedToBudget: false,
      rank: rank++,
      completed: false,
      completedAt: null,
      expenseId: null,
      transferId: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    migratedItems.push({ bucketId, id: itemId, data });
    log(`${ruleDoc.id} "${data.name}" ${rule.frequency} ${data.amount} ${base} → ${bucketId}/${itemId}${endDate ? ` (ends ${endDate.toDateString()})` : ''}`);
    writes.push(() => user.collection('goals').doc(bucketId).collection('lineItems').doc(itemId).set(data, { merge: true }));
    writes.push(() => ruleDoc.ref.update({ archived: true, migratedToItem: `${bucketId}/${itemId}`, updatedAt: Timestamp.now() }));
  }
  for (const [bucketId, { kind, type }] of bucketsNeeded) {
    const items = migratedItems.filter((item) => item.bucketId === bucketId);
    const total = round2(items.reduce((sum, item) => sum + item.data.amount, 0));
    log(`bucket ${bucketId}: ${items.length} items`);
    writes.push(() =>
      user.collection('goals').doc(bucketId).set(
        {
          name: `Migrated ${kind === 'Fixed' ? 'monthly' : 'one-off'} ${type.toLowerCase()} budgets`,
          description: 'Created from your old category budgets (Budgets v2 migration).',
          kind,
          type,
          currency: base,
          deadline: null,
          archived: false,
          totalAmount: total,
          lineItemCount: items.length,
          completedLineItemCount: 0,
          amountCompleted: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      )
    );
  }

  // --- 2. payments → transaction back-references --------------------------
  console.log('\n2. Goal item payments → bucketItem on transactions/transfers');
  let linked = 0;
  let missing = 0;
  let alreadyLinked = 0;
  for (const [goalId, items] of itemsByGoal) {
    for (const item of items) {
      const payments: { id: string; kind: 'expense' | 'transfer'; date: FirebaseFirestore.Timestamp | null }[] =
        item.data.payments?.length
          ? item.data.payments
          : [
              ...(item.data.expenseId ? [{ id: item.data.expenseId, kind: 'expense' as const, date: item.data.completedAt ?? null }] : []),
              ...(item.data.transferId ? [{ id: item.data.transferId, kind: 'transfer' as const, date: item.data.completedAt ?? null }] : []),
            ];
      for (const payment of payments) {
        const ref = user.collection(payment.kind === 'transfer' ? 'transfers' : 'transactions').doc(payment.id);
        const snap = await ref.get();
        if (!snap.exists) {
          missing++;
          log(`missing ${payment.kind} ${payment.id} (item ${goalId}/${item.id} "${item.data.name}") — left alone`);
          continue;
        }
        if (snap.data()?.bucketItem) {
          alreadyLinked++;
          continue;
        }
        const date: Date = (payment.date ?? snap.data()!.date).toDate();
        const bucketItem = { bucketId: goalId, itemId: item.id, month: monthKeyOf(date) };
        linked++;
        writes.push(() => ref.update({ bucketItem }));
      }
    }
  }
  log(`${linked} to link, ${alreadyLinked} already linked, ${missing} missing`);

  // --- 3 & 4. item fixes ----------------------------------------------------
  console.log('\n3. Reopen completed Fixed items / 4. schedule added-to-budget Variable items');
  for (const [goalId, items] of itemsByGoal) {
    for (const item of items) {
      const ref = user.collection('goals').doc(goalId).collection('lineItems').doc(item.id);
      if (goalKind.get(goalId) === 'Fixed' && item.data.completed) {
        log(`reopen ${goalId}/${item.id} "${item.data.name}"`);
        writes.push(() => ref.update({ completed: false, completedAt: null, updatedAt: Timestamp.now() }));
      }
      if (goalKind.get(goalId) !== 'Fixed' && item.data.addedToBudget && !item.data.dueDate) {
        const when: Date = (item.data.updatedAt ?? item.data.createdAt ?? Timestamp.now()).toDate();
        const dueDate = Timestamp.fromDate(new Date(when.getFullYear(), when.getMonth(), 1));
        log(`schedule ${goalId}/${item.id} "${item.data.name}" → ${monthKeyOf(when)}`);
        writes.push(() => ref.update({ dueDate, updatedAt: Timestamp.now() }));
      }
    }
  }

  // --- double-count warning -------------------------------------------------
  console.log('\nPlanned totals (base currency) — migrated rules vs existing goal items, by month');
  const now = monthKeyOf(new Date());
  for (const month of [-1, 0, 1, 2].map((delta) => addMonths(now, delta))) {
    const fromRules = new Map<string, number>();
    for (const item of migratedItems) {
      const occurrence = itemOccurrence({ id: item.id, ...item.data } as never, month);
      if (occurrence) fromRules.set(item.data.categoryId, (fromRules.get(item.data.categoryId) ?? 0) + occurrence.planned);
    }
    const fromGoals = new Map<string, number>();
    for (const [goalId, items] of itemsByGoal) {
      if (goalArchived.get(goalId)) continue;
      const currency = goalsSnap.docs.find((d) => d.id === goalId)?.data().currency ?? base;
      for (const item of items) {
        const occurrence = itemOccurrence({ id: item.id, ...item.data } as never, month);
        if (!occurrence || !item.data.categoryId) continue;
        fromGoals.set(item.data.categoryId, (fromGoals.get(item.data.categoryId) ?? 0) + convert(occurrence.planned, currency, base, rates));
      }
    }
    const sum = (map: Map<string, number>) => round2([...map.values()].reduce((a, b) => a + b, 0));
    log(`${month}: migrated rules ${sum(fromRules)}, goal items ${sum(fromGoals)}`);
    for (const [categoryId, amount] of fromGoals) {
      if (!fromRules.has(categoryId)) continue;
      log(
        `  ⚠ ${categories.get(categoryId)?.name ?? categoryId}: rule ${round2(fromRules.get(categoryId)!)} + goal items ${round2(amount)} — ` +
          `the goal items used to count inside the rule; trim the migrated item if that month now plans too much`
      );
    }
  }

  console.log(`\n${writes.length} writes ${APPLY ? 'to apply' : 'planned (dry run — nothing written)'}`);
  if (!APPLY) return;
  for (const write of writes) await write();
  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
