// The flow-type migration, as a pure plan: classify every existing bucket
// and item as income, expense, savings or transfer; split buckets that mix
// types into one bucket per type; write each item's subtype explicitly;
// fix savings sign errors; tag loans received as debt financing. Returns
// the writes to make and a report of every change, shown once to the
// household as a review page. src/shared/firestore/flowMigration.ts reads
// the data, applies the plan and stores the report.
//
// Safe to run more than once: new buckets get deterministic ids
// (`${bucketId}__${type}`), every write sets a value rather than
// incrementing one, and planning already-migrated data yields no writes
// (each bucket holds one type, each item has its subtype) — see
// test/budgetFlow.test.ts.

import {
  FLOW_NOUN,
  inferExpenseKind,
  inferIncomeSubtype,
  incomeSubtypeOfTransaction,
  savingsModeOf,
  SAVINGS_ACCOUNT_TYPE,
  type FlowType,
} from './flow';
import type { BucketItemNecessity, ExpenseKind, Frequency, IncomeSubtype, SavingsMode } from '../firestore/types';

export const FLOW_MIGRATION_ID = 'flowTypesV1';
export const FLOW_MIGRATION_VERSION = 1;

const TRANSFER_KINDS = new Set(['Wallet to wallet', 'Wallet to savings', 'Savings to wallet']);

export interface MigrationBucket {
  id: string;
  name: string;
  type?: FlowType | null;
  kind?: 'Fixed' | 'Variable';
  currency: string;
  archived?: boolean;
}

export interface MigrationItem {
  id: string;
  name: string;
  amount: number;
  categoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  dueDate: unknown | null;
  recurrence?: { frequency: Frequency } | null;
  necessity?: BucketItemNecessity | null;
  incomeSubtype?: IncomeSubtype | null;
  expenseKind?: ExpenseKind | null;
  savingsMode?: SavingsMode | null;
  monthOverrides?: Record<string, { amount: number }>;
  subItems?: unknown[] | null;
}

export interface MigrationInput {
  buckets: MigrationBucket[];
  itemsByBucket: Record<string, MigrationItem[]>;
  categories: Map<string, { name: string; transactionType: 'Expense' | 'Income' | 'Savings' }>;
  accountType: Map<string, string>;
  /** Income transactions (type 'Income'), for tagging loans. */
  incomeTransactions: {
    id: string;
    description: string;
    linkedDebtId?: string | null;
    isDebtRepayment?: boolean;
    incomeSubtype?: IncomeSubtype | null;
  }[];
}

export type ReportKind = 'bucket-type' | 'split' | 'item-moved' | 'subtype' | 'kind-guessed' | 'sign-fixed' | 'debt-financing' | 'needs-attention';

export interface ReportEntry {
  kind: ReportKind;
  subject: string;
  detail: string;
}

export interface MigrationPlan {
  newBuckets: { id: string; from: string; name: string; type: FlowType; kind: 'Fixed' | 'Variable'; currency: string }[];
  bucketPatches: { bucketId: string; patch: { type: FlowType } }[];
  itemMoves: { itemId: string; from: string; to: string }[];
  /** Keyed by the bucket the item ends up in. */
  itemPatches: { bucketId: string; itemId: string; patch: Record<string, unknown> }[];
  transactionPatches: { id: string; patch: { incomeSubtype: IncomeSubtype } }[];
  report: ReportEntry[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** An item's flow type, from everything older data can tell us. */
export function classifyItem(bucket: MigrationBucket, item: MigrationItem, input: Pick<MigrationInput, 'categories' | 'accountType'>): FlowType {
  const category = item.categoryId ? input.categories.get(item.categoryId) : undefined;
  const isTransferKind = Boolean(item.categoryId && TRANSFER_KINDS.has(item.categoryId));
  const intoSavings =
    item.categoryId === 'Wallet to savings' ||
    (item.toAccountId ? input.accountType.get(item.toAccountId) === SAVINGS_ACCOUNT_TYPE : false) ||
    (!item.toAccountId && item.accountId ? input.accountType.get(item.accountId) === SAVINGS_ACCOUNT_TYPE : false);
  // Fees are an expense of their own, even in a transfers bucket.
  if (/\b(fee|fees|charge|charges)\b/i.test(item.name) && !intoSavings) return 'Expense';
  if (category?.transactionType === 'Savings' || bucket.type === 'Savings' || intoSavings) return 'Savings';
  if (category?.transactionType === 'Income' || bucket.type === 'Income') return 'Income';
  if (bucket.type === 'Transfer' || isTransferKind || item.toAccountId || /\btransfers?\b/i.test(bucket.name)) return 'Transfer';
  return 'Expense';
}

export function planFlowMigration(input: MigrationInput): MigrationPlan {
  const plan: MigrationPlan = { newBuckets: [], bucketPatches: [], itemMoves: [], itemPatches: [], transactionPatches: [], report: [] };
  const existingIds = new Set(input.buckets.map((b) => b.id));
  const firstSavingsCategory = [...input.categories.entries()].find(([, c]) => c.transactionType === 'Savings')?.[0] ?? null;

  for (const bucket of input.buckets) {
    const items = input.itemsByBucket[bucket.id] ?? [];
    const flows = new Map<string, FlowType>();
    for (const item of items) flows.set(item.id, classifyItem(bucket, item, input));

    // The bucket keeps the type holding most of its planned money (its own
    // type when empty); every other type moves to a bucket of its own.
    const weight = new Map<FlowType, number>();
    for (const item of items) {
      const flow = flows.get(item.id)!;
      weight.set(flow, (weight.get(flow) ?? 0) + Math.max(Math.abs(item.amount), 1));
    }
    const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]);
    const keep: FlowType = ranked[0]?.[0] ?? bucket.type ?? (/\btransfers?\b/i.test(bucket.name) ? 'Transfer' : 'Expense');

    if ((bucket.type ?? 'Expense') !== keep) {
      plan.bucketPatches.push({ bucketId: bucket.id, patch: { type: keep } });
      plan.report.push({
        kind: 'bucket-type',
        subject: bucket.name,
        detail: `Now a${keep === 'Income' || keep === 'Expense' ? 'n' : ''} ${FLOW_NOUN[keep].toLowerCase()} basket (was ${(bucket.type ?? 'Expense').toLowerCase()}).`,
      });
    }

    const targetOf = new Map<FlowType, string>([[keep, bucket.id]]);
    for (const [flow] of ranked.slice(1)) {
      const id = `${bucket.id}__${flow.toLowerCase()}`;
      targetOf.set(flow, id);
      const name = `${bucket.name} · ${FLOW_NOUN[flow]}`;
      if (!existingIds.has(id)) {
        plan.newBuckets.push({ id, from: bucket.id, name, type: flow, kind: bucket.kind ?? 'Variable', currency: bucket.currency });
        existingIds.add(id);
      }
      plan.report.push({
        kind: 'split',
        subject: bucket.name,
        detail: `Held more than one type, so its ${FLOW_NOUN[flow].toLowerCase()} items moved to a new basket, "${name}".`,
      });
    }

    for (const item of items) {
      const flow = flows.get(item.id)!;
      const target = targetOf.get(flow)!;
      if (target !== bucket.id) {
        plan.itemMoves.push({ itemId: item.id, from: bucket.id, to: target });
        plan.report.push({ kind: 'item-moved', subject: item.name, detail: `Moved from "${bucket.name}" to "${bucket.name} · ${FLOW_NOUN[flow]}".` });
      }

      const patch: Record<string, unknown> = {};
      const category = item.categoryId ? input.categories.get(item.categoryId) : undefined;
      const recurring = bucket.kind === 'Fixed' && Boolean(item.recurrence && item.recurrence.frequency !== 'Once');

      if (flow === 'Income' && !item.incomeSubtype) {
        const subtype = inferIncomeSubtype(item.name, category?.name);
        patch.incomeSubtype = subtype;
        plan.report.push({ kind: 'subtype', subject: item.name, detail: `Income subtype set to ${subtype === 'debt_financing' ? 'debt financing' : subtype}.` });
      }
      if (flow === 'Expense' && !item.expenseKind) {
        const { kind, guessed } = inferExpenseKind({
          name: item.name,
          categoryName: category?.name,
          recurring,
          hasDueDate: Boolean(item.dueDate),
          hasSubItems: Boolean(item.subItems?.length),
        });
        patch.expenseKind = kind;
        plan.report.push({
          kind: guessed ? 'kind-guessed' : 'subtype',
          subject: item.name,
          detail: guessed ? `Set to variable from its name or category. Change it in the Expenses table if that's wrong.` : `Expense kind set to ${kind}.`,
        });
      }
      if (flow === 'Savings' && !item.savingsMode) {
        const mode = savingsModeOf(item);
        patch.savingsMode = mode;
        plan.report.push({ kind: 'subtype', subject: item.name, detail: `Savings set to ${mode}.` });
      }
      // A savings item filed under a transfer kind takes a real Savings
      // category, so recording it writes a Savings entry.
      if (flow === 'Savings' && item.categoryId && TRANSFER_KINDS.has(item.categoryId) && firstSavingsCategory) {
        patch.categoryId = firstSavingsCategory;
      }
      if (flow === 'Transfer' && item.categoryId && !TRANSFER_KINDS.has(item.categoryId)) {
        patch.categoryId = 'Wallet to wallet';
      }
      if (flow === 'Transfer' && !item.toAccountId) {
        plan.report.push({ kind: 'needs-attention', subject: item.name, detail: 'This transfer has no destination account. Add one so it can be prepared and recorded.' });
      }

      // Savings are positive amounts; a negative plan was a sign error.
      if (flow === 'Savings') {
        if (item.amount < 0) {
          patch.amount = Math.abs(item.amount);
          plan.report.push({ kind: 'sign-fixed', subject: item.name, detail: `Planned amount ${fmt(item.amount)} corrected to ${fmt(Math.abs(item.amount))}.` });
        }
        const overrides = item.monthOverrides ?? {};
        const negative = Object.entries(overrides).filter(([, o]) => o.amount < 0);
        if (negative.length) {
          patch.monthOverrides = Object.fromEntries(Object.entries(overrides).map(([m, o]) => [m, { ...o, amount: Math.abs(o.amount) }]));
          plan.report.push({ kind: 'sign-fixed', subject: item.name, detail: `${negative.length} month amount${negative.length === 1 ? '' : 's'} corrected to positive.` });
        }
      }

      if (Object.keys(patch).length) plan.itemPatches.push({ bucketId: target, itemId: item.id, patch });
    }
  }

  for (const t of input.incomeTransactions) {
    if (t.incomeSubtype) continue;
    if (incomeSubtypeOfTransaction(t) !== 'debt_financing') continue;
    plan.transactionPatches.push({ id: t.id, patch: { incomeSubtype: 'debt_financing' } });
    plan.report.push({ kind: 'debt-financing', subject: t.description || 'Loan received', detail: 'Counted as income, under debt financing (borrowed).' });
  }

  return plan;
}

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  'bucket-type': 'Basket type',
  split: 'Basket split',
  'item-moved': 'Item moved',
  subtype: 'Subtype',
  'kind-guessed': 'Check this',
  'sign-fixed': 'Sign fixed',
  'debt-financing': 'Debt financing',
  'needs-attention': 'Needs attention',
};
