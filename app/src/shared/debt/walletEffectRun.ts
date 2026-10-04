// Running a wallet-effect change (walletEffect.ts) against stored documents,
// all inside one transaction: the debt, its linked transactions, every
// account they touch, statsMonthly for each affected month, stats/home,
// repayment links and the activity log entry are read first, then written
// together, so a failure part way leaves nothing half updated.
//
// Written against a small LedgerStore interface rather than Firestore
// itself: src/shared/firestore/debtWrites.ts adapts it to runTransaction
// (paths under users/{uid}), and test/debtWalletEffect.test.ts runs it on
// an in-memory store. Documents here are plain objects with Date values.
//
// Idempotent twice over: a change is planned against the current state
// (asking for the state the debt is already in writes nothing), and each
// change carries its own id, so a retried save finds its activity entry and
// stops.

import { round2, type CurrencyContext } from '../firestore/currency';
import {
  WalletChangeError,
  defaultFormat,
  describeChange,
  invertPlan,
  monthKey,
  planDeleteDebt,
  planWalletChange,
  type ActivityChange,
  type DebtKind,
  type LedgerAccount,
  type LedgerTx,
  type TxState,
  type WalletChange,
  type WalletPlan,
  type WalletState,
} from './walletEffect';

export type LedgerDoc = Record<string, unknown>;

export interface LedgerTxn {
  get(path: string): Promise<LedgerDoc | null>;
  set(path: string, data: LedgerDoc): void;
  /** Merges nested maps, like Firestore's set(..., { merge: true }). */
  merge(path: string, data: LedgerDoc): void;
  delete(path: string): void;
}

export interface LedgerStore {
  /** Transactions whose linkedDebtId is this debt (a query: run before the transaction). */
  linkedTransactionIds(debtId: string): Promise<string[]>;
  repaymentIds(debtId: string): Promise<string[]>;
  run<T>(fn: (t: LedgerTxn) => Promise<T>): Promise<T>;
  newId(): string;
}

export const ledgerPaths = {
  debt: (debtId: string) => `debts/${debtId}`,
  repayment: (debtId: string, repaymentId: string) => `debts/${debtId}/repayments/${repaymentId}`,
  activity: (debtId: string, entryId: string) => `debts/${debtId}/activity/${entryId}`,
  transaction: (id: string) => `transactions/${id}`,
  account: (id: string) => `accounts/${id}`,
  month: (key: string) => `statsMonthly/${key}`,
  home: 'stats/home',
};

/** A stored activity log entry (users/{uid}/debts/{id}/activity/{entryId}). */
export interface DebtActivityEntry {
  at: Date;
  kind: 'created' | 'toRecordOnly' | 'toCash' | 'edit' | 'plan' | 'repayment' | 'details' | 'undo' | 'paidOff' | 'archived';
  title: string;
  changes: ActivityChange[];
  /** The balance and figure effects, as the preview showed them. */
  lines: string[];
  /** For a wallet change: the plan, so undo can reverse exactly it. */
  plan: WalletPlan | null;
  undoneAt: Date | null;
  undoOf: string | null;
}

type DateLike = Date | { toDate(): Date };
const toDate = (value: unknown): Date => (value instanceof Date ? value : (value as { toDate(): Date }).toDate());

type Doc = LedgerDoc & { id: string };

/** A transaction document as the planner sees it, or null when it isn't the debt's. */
export function ledgerTxOf(doc: Doc, debt: { borrowingTransactionId?: string | null }, repaymentOfTx: Map<string, string>): LedgerTx | null {
  const repaymentId = repaymentOfTx.get(doc.id) ?? null;
  const isRepayment = Boolean(doc.isDebtRepayment) || repaymentId !== null;
  const isBorrowing = !isRepayment && (doc.id === debt.borrowingTransactionId || doc.incomeSubtype === 'debt_financing');
  if (!isRepayment && !isBorrowing) return null;
  return {
    id: doc.id,
    date: toDate(doc.date as DateLike),
    type: doc.type === 'Income' ? 'Income' : 'Expense',
    description: String(doc.description ?? ''),
    accountId: String(doc.accountId),
    categoryId: (doc.categoryId as string | null) ?? null,
    amount: Number(doc.amount) || 0,
    direction: doc.direction === 'Inflow' ? 'Inflow' : 'Outflow',
    excluded: Boolean(doc.excluded),
    excludedReason: (doc.excludedReason as string | null) ?? null,
    role: isRepayment ? 'repayment' : 'borrowing',
    repaymentId,
  };
}

/**
 * The planner's state from documents: the debt, its repayments, the
 * transactions linked to it and the accounts. Shared by the runner and the
 * forms' live preview (which pass Firestore docs, Timestamps and all).
 */
export function walletStateOf(
  debtId: string,
  debtDoc: LedgerDoc,
  repaymentDocs: Doc[],
  txDocs: Doc[],
  accountDocs: Doc[]
): WalletState {
  const repaymentOfTx = new Map<string, string>();
  for (const r of repaymentDocs) if (r.transactionId) repaymentOfTx.set(String(r.transactionId), r.id);
  const borrowingTransactionId = (debtDoc.borrowingTransactionId as string | null | undefined) ?? null;
  const txs = txDocs.map((d) => ledgerTxOf(d, { borrowingTransactionId }, repaymentOfTx)).filter((t): t is LedgerTx => t !== null);
  const borrowings = txs.filter((t) => t.role === 'borrowing');
  // The recorded one first, then a live one, then the newest.
  const borrowing =
    borrowings.find((t) => t.id === borrowingTransactionId) ??
    borrowings.find((t) => !t.excluded) ??
    borrowings.sort((a, b) => b.date.getTime() - a.date.getTime())[0] ??
    null;
  const repayments = repaymentDocs.map((r) => ({
    id: r.id,
    amount: Number(r.amount) || 0,
    date: toDate(r.date as DateLike),
    transactionId: (r.transactionId as string | null) ?? null,
  }));
  const accounts: Record<string, LedgerAccount> = {};
  for (const a of accountDocs) {
    accounts[a.id] = {
      id: a.id,
      name: String(a.name ?? 'Account'),
      currency: String(a.currency ?? ''),
      balance: Number(a.currentBalance) || 0,
      lockedAmount: Number(a.lockedAmount) || 0,
      frozen: Boolean(a.frozen),
    };
  }
  return {
    debt: {
      id: debtId,
      name: String(debtDoc.name ?? 'Debt'),
      debtType: (debtDoc.debtType as DebtKind) ?? 'existing',
      accountId: (debtDoc.accountId as string | null) ?? null,
      principalAmount: Number(debtDoc.principalAmount) || 0,
      startDate: toDate(debtDoc.startDate as DateLike),
      currentBalance: Number(debtDoc.currentBalance) || 0,
      totalRepaid: Number(debtDoc.totalRepaid) || 0,
      borrowingTransactionId: borrowing?.id ?? borrowingTransactionId,
    },
    borrowing,
    repayments,
    repaymentTxs: txs.filter((t) => t.role === 'repayment'),
    accounts,
  };
}

function changeAccountIds(change: WalletChange): string[] {
  if (change.kind === 'toCash') {
    const ids = [change.accountId];
    if (change.repayments.fromAccounts) ids.push(change.repayments.accountId, ...Object.values(change.repayments.perRepayment ?? {}));
    return ids;
  }
  if (change.kind === 'edit' && change.accountId) return [change.accountId];
  return [];
}

const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => Boolean(id)))];

async function readDocs(t: LedgerTxn, ids: string[], path: (id: string) => string): Promise<Doc[]> {
  const docs = await Promise.all(ids.map(async (id) => {
    const data = await t.get(path(id));
    return data ? { ...data, id } : null;
  }));
  return docs.filter((d): d is Doc => d !== null);
}

function txDoc(id: string, tx: TxState, debtId: string, uid: string): LedgerDoc {
  const signedAmount = tx.direction === 'Inflow' ? tx.amount : -tx.amount;
  return {
    date: tx.date,
    type: tx.type,
    description: tx.description,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    amount: tx.amount,
    direction: tx.direction,
    signedAmount,
    month: monthKey(tx.date),
    linkedDebtId: debtId,
    ...(tx.role === 'repayment' ? { isDebtRepayment: true } : { incomeSubtype: 'debt_financing' }),
    excluded: tx.excluded,
    excludedReason: tx.excludedReason,
    bucketItem: null,
    createdBy: uid,
    createdAt: tx.date,
  };
}

/**
 * Writes a plan. Reads statsMonthly and stats/home first (a transaction
 * reads before it writes), then every write. `accounts` holds the already
 * read account documents by id.
 */
async function writePlan(t: LedgerTxn, plan: WalletPlan, debtId: string, uid: string, now: Date, accounts: Map<string, Doc>) {
  const monthKeys = Object.keys(plan.months);
  const monthDocs = new Map(await Promise.all(monthKeys.map(async (key) => [key, (await t.get(ledgerPaths.month(key))) ?? {}] as const)));
  const home = (await t.get(ledgerPaths.home)) ?? {};

  for (const c of plan.txChanges) {
    const path = ledgerPaths.transaction(c.id);
    if (!c.after) {
      t.delete(path);
    } else if (!c.before) {
      t.set(path, txDoc(c.id, c.after, debtId, uid));
    } else {
      t.merge(path, {
        date: c.after.date,
        month: monthKey(c.after.date),
        accountId: c.after.accountId,
        amount: c.after.amount,
        signedAmount: c.after.direction === 'Inflow' ? c.after.amount : -c.after.amount,
        description: c.after.description,
        excluded: c.after.excluded,
        excludedReason: c.after.excludedReason,
        ...(c.after.excluded !== c.before.excluded ? { excludedAt: c.after.excluded ? now : null } : {}),
        updatedAt: now,
      });
    }
  }

  for (const [accountId, delta] of Object.entries(plan.accounts)) {
    const current = Number(accounts.get(accountId)?.currentBalance) || 0;
    t.merge(ledgerPaths.account(accountId), { currentBalance: round2(current + delta) });
  }

  for (const key of monthKeys) {
    const m = plan.months[key];
    const doc = monthDocs.get(key)!;
    const spend = (doc.perCategorySpend ?? {}) as Record<string, number>;
    const counts = (doc.perCategoryCount ?? {}) as Record<string, number>;
    const update: LedgerDoc = {
      totalIncome: round2((Number(doc.totalIncome) || 0) + m.income),
      totalExpense: round2((Number(doc.totalExpense) || 0) + m.expense),
      transactionCount: (Number(doc.transactionCount) || 0) + m.count,
      lastUpdated: now,
    };
    const cats = Object.entries(m.categories);
    if (cats.length) {
      update.perCategorySpend = Object.fromEntries(cats.map(([id, v]) => [id, round2((spend[id] ?? 0) + v.spend)]));
      update.perCategoryCount = Object.fromEntries(cats.map(([id, v]) => [id, (counts[id] ?? 0) + v.count]));
    }
    t.merge(ledgerPaths.month(key), update);
  }

  const thisMonth = plan.months[monthKey(now)];
  if (plan.totalBalanceBase !== 0 || thisMonth) {
    t.merge(ledgerPaths.home, {
      totalBalanceBase: round2((Number(home.totalBalanceBase) || 0) + plan.totalBalanceBase),
      ...(thisMonth
        ? {
            thisMonthIncome: round2((Number(home.thisMonthIncome) || 0) + thisMonth.income),
            thisMonthExpense: round2((Number(home.thisMonthExpense) || 0) + thisMonth.expense),
          }
        : {}),
      lastUpdated: now,
    });
  }

  for (const link of plan.repaymentLinks) {
    t.merge(ledgerPaths.repayment(debtId, link.repaymentId), { transactionId: link.after });
  }

  const d = plan.debt.after;
  t.merge(ledgerPaths.debt(debtId), {
    debtType: d.debtType,
    accountId: d.accountId,
    principalAmount: d.principalAmount,
    startDate: d.startDate,
    currentBalance: d.currentBalance,
    borrowingTransactionId: d.borrowingTransactionId,
    updatedAt: now,
  });
}

export interface RunOptions {
  debtId: string;
  change: WalletChange;
  ctx: Pick<CurrencyContext, 'base' | 'rates'>;
  now: Date;
  /** The change's own id (the activity entry's id): a retried save with the same id does nothing. */
  changeId: string;
  uid: string;
  format?: (n: number) => string;
}

export interface RunResult {
  applied: boolean;
  plan: WalletPlan | null;
  changeId: string;
}

/** Plans and applies one wallet change in a single transaction. */
export async function runWalletChange(store: LedgerStore, options: RunOptions): Promise<RunResult> {
  const { debtId, change, ctx, now, changeId, uid } = options;
  const format = options.format ?? defaultFormat;
  const [linkedIds, repaymentIds] = await Promise.all([store.linkedTransactionIds(debtId), store.repaymentIds(debtId)]);

  return store.run(async (t) => {
    if (await t.get(ledgerPaths.activity(debtId, changeId))) return { applied: false, plan: null, changeId };
    const debtDoc = await t.get(ledgerPaths.debt(debtId));
    if (!debtDoc) throw new WalletChangeError('This debt no longer exists.');
    const repayments = await readDocs(t, repaymentIds, (id) => ledgerPaths.repayment(debtId, id));
    const txs = await readDocs(
      t,
      unique([...linkedIds, ...repayments.map((r) => r.transactionId as string | null), debtDoc.borrowingTransactionId as string | null]),
      ledgerPaths.transaction
    );
    const accountIds = unique([...txs.map((d) => d.accountId as string), debtDoc.accountId as string | null, ...changeAccountIds(change)]);
    const accounts = await readDocs(t, accountIds, ledgerPaths.account);
    const state = walletStateOf(debtId, debtDoc, repayments, txs, accounts);
    const plan = planWalletChange(state, change, ctx, now, () => store.newId(), format);
    if (plan.noop) return { applied: false, plan, changeId };

    await writePlan(t, plan, debtId, uid, now, new Map(accounts.map((a) => [a.id, a])));
    const names = new Map(accounts.map((a) => [a.id, String(a.name ?? 'Account')]));
    const { title, changes } = describeChange(plan, (id) => (id ? (names.get(id) ?? 'Account') : 'None'), format);
    const entry: DebtActivityEntry = { at: now, kind: plan.kind, title, changes, lines: plan.lines, plan, undoneAt: null, undoOf: null };
    t.set(ledgerPaths.activity(debtId, changeId), entry as unknown as LedgerDoc);
    t.merge(ledgerPaths.debt(debtId), { lastChangeId: changeId });
    return { applied: true, plan, changeId };
  });
}

function sameStored(doc: Doc | undefined, state: TxState | null) {
  if (!state) return !doc;
  if (!doc) return false;
  return (
    Boolean(doc.excluded) === state.excluded &&
    Number(doc.amount) === state.amount &&
    doc.accountId === state.accountId &&
    monthKey(toDate(doc.date as DateLike)) === monthKey(state.date)
  );
}

/**
 * Undoes a wallet change through the same write path: its plan inverted
 * (pairs swapped, effects negated). Refused once the debt has changed again
 * since, or when a linked transaction no longer looks the way the change
 * left it. Undoing twice does nothing the second time.
 */
export async function undoWalletChange(
  store: LedgerStore,
  options: { debtId: string; changeId: string; undoId: string; now: Date; uid: string }
): Promise<{ applied: boolean }> {
  const { debtId, changeId, undoId, now, uid } = options;
  return store.run(async (t) => {
    const entry = (await t.get(ledgerPaths.activity(debtId, changeId))) as unknown as DebtActivityEntry | null;
    if (!entry?.plan) throw new WalletChangeError('There is nothing to undo.');
    if (entry.undoneAt) return { applied: false };
    const debtDoc = await t.get(ledgerPaths.debt(debtId));
    if (!debtDoc) throw new WalletChangeError('This debt no longer exists.');
    if (debtDoc.lastChangeId !== changeId) throw new WalletChangeError('This debt has changed since, so that change can’t be undone.');
    const plan = invertPlan(entry.plan);
    const txs = new Map((await readDocs(t, plan.txChanges.map((c) => c.id), ledgerPaths.transaction)).map((d) => [d.id, d]));
    for (const c of plan.txChanges) {
      if (!sameStored(txs.get(c.id), c.before)) throw new WalletChangeError('A linked transaction has changed since, so that change can’t be undone.');
    }
    const accounts = await readDocs(t, Object.keys(plan.accounts), ledgerPaths.account);
    await writePlan(t, plan, debtId, uid, now, new Map(accounts.map((a) => [a.id, a])));
    t.merge(ledgerPaths.activity(debtId, changeId), { undoneAt: now });
    const undo: DebtActivityEntry = {
      at: now,
      kind: 'undo',
      title: `Undid: ${entry.title.charAt(0).toLowerCase()}${entry.title.slice(1)}`,
      changes: entry.changes.map((c) => ({ label: c.label, from: c.to, to: c.from })),
      lines: ['Balances, month figures and transactions are back as they were.'],
      plan: null,
      undoneAt: null,
      undoOf: changeId,
    };
    t.set(ledgerPaths.activity(debtId, undoId), undo as unknown as LedgerDoc);
    t.merge(ledgerPaths.debt(debtId), { lastChangeId: undoId });
    return { applied: true };
  });
}

/**
 * Deletes a debt that has no repayments, with its borrowing transaction
 * (its balance and month effects reversed) and its activity log, in one
 * transaction. `activityIds` comes from a query run before it.
 */
export async function runDeleteDebt(
  store: LedgerStore,
  options: { debtId: string; ctx: Pick<CurrencyContext, 'base' | 'rates'>; now: Date; uid: string; activityIds: string[]; format?: (n: number) => string }
): Promise<WalletPlan> {
  const { debtId, ctx, now, uid, activityIds } = options;
  const [linkedIds, repaymentIds] = await Promise.all([store.linkedTransactionIds(debtId), store.repaymentIds(debtId)]);
  return store.run(async (t) => {
    const debtDoc = await t.get(ledgerPaths.debt(debtId));
    if (!debtDoc) throw new WalletChangeError('This debt no longer exists.');
    const repayments = await readDocs(t, repaymentIds, (id) => ledgerPaths.repayment(debtId, id));
    const txs = await readDocs(t, unique([...linkedIds, debtDoc.borrowingTransactionId as string | null]), ledgerPaths.transaction);
    const accounts = await readDocs(t, unique(txs.map((d) => d.accountId as string)), ledgerPaths.account);
    const state = walletStateOf(debtId, debtDoc, repayments, txs, accounts);
    const plan = planDeleteDebt(state, ctx, now, options.format);
    await writePlan(t, plan, debtId, uid, now, new Map(accounts.map((a) => [a.id, a])));
    for (const id of activityIds) t.delete(ledgerPaths.activity(debtId, id));
    t.delete(ledgerPaths.debt(debtId));
    return plan;
  });
}
