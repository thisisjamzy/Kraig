// A debt's wallet effect: whether the borrowed money passed through one of
// the household's accounts (a cash debt) or not (record only, debtType
// 'existing'). Switching between the two, and the cash-debt edits that move
// money (amount, account received into, date received), are planned here
// as plain data, with no Firestore: walletEffectRun.ts reads the current
// state inside one runTransaction, asks planWalletChange what changes, and
// writes exactly that.
//
// Every transaction change is a before/after pair (null before = created,
// null after = deleted), so undo is the same plan with the pairs swapped
// and the balance and month effects negated (invertPlan). Excluded
// transactions stay as documents with a reason; they just stop counting.
// Planning against the current state makes a change idempotent: asking for
// the state the debt is already in plans nothing.
//
// The debt's own balance owed (principal minus repayments) never moves on
// a type switch; only the wallets and the month figures do.
//
// Pure, tested in test/debtWalletEffect.test.ts.

import { convert, round2, type CurrencyContext } from '../firestore/currency';

export type DebtKind = 'cash' | 'existing';

/** One ledger transaction linked to a debt, as far as this module cares. */
export interface TxState {
  date: Date;
  type: 'Income' | 'Expense';
  description: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  direction: 'Inflow' | 'Outflow';
  excluded: boolean;
  excludedReason: string | null;
  role: 'borrowing' | 'repayment';
  repaymentId: string | null;
}

export interface LedgerTx extends TxState {
  id: string;
}

export interface LedgerAccount {
  id: string;
  name: string;
  currency: string;
  balance: number;
  lockedAmount: number;
  frozen: boolean;
}

export interface DebtFields {
  debtType: DebtKind;
  accountId: string | null;
  principalAmount: number;
  startDate: Date;
  currentBalance: number;
  borrowingTransactionId: string | null;
}

export interface DebtSnapshot extends DebtFields {
  id: string;
  name: string;
  totalRepaid: number;
}

export interface RepaymentSnapshot {
  id: string;
  amount: number;
  date: Date;
  transactionId: string | null;
}

export interface WalletState {
  debt: DebtSnapshot;
  /** The debt financing income transaction (live or excluded), if any. */
  borrowing: LedgerTx | null;
  repayments: RepaymentSnapshot[];
  /** Repayment transactions linked to the debt (live or excluded). */
  repaymentTxs: LedgerTx[];
  accounts: Record<string, LedgerAccount>;
}

export type RepaymentChoice =
  | { fromAccounts: false }
  | { fromAccounts: true; accountId: string; perRepayment?: Record<string, string> };

export type WalletChange =
  | { kind: 'toRecordOnly'; repayments: 'keep' | 'remove' }
  | { kind: 'toCash'; accountId: string; receivedOn: Date; repayments: RepaymentChoice }
  | { kind: 'edit'; amount?: number; accountId?: string; date?: Date };

export interface TxChange {
  id: string;
  before: TxState | null;
  after: TxState | null;
}

export interface MonthDelta {
  income: number;
  expense: number;
  count: number;
  /** perCategorySpend / perCategoryCount deltas, by category id. */
  categories: Record<string, { spend: number; count: number }>;
  /** Of `income`, how much was borrowed money (for the preview's words). */
  borrowed: number;
}

export interface WalletPlan {
  kind: WalletChange['kind'];
  txChanges: TxChange[];
  repaymentLinks: { repaymentId: string; before: string | null; after: string | null }[];
  debt: { before: DebtFields; after: DebtFields };
  /** Native-currency balance change per account id. */
  accounts: Record<string, number>;
  /** Base-currency figures change per month (yyyy-MM). */
  months: Record<string, MonthDelta>;
  /** stats/home totalBalanceBase change. */
  totalBalanceBase: number;
  /** The preview, one sentence per line. */
  lines: string[];
  /** Shown before saving; never block. */
  warnings: string[];
  noop: boolean;
}

export const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-US');

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October", or "October 2025" outside the current year. */
export function monthName(key: string, now: Date) {
  const [year, month] = key.split('-').map(Number);
  return year === now.getFullYear() ? MONTH_NAMES[month - 1] : `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "3 Oct" */
export function shortDay(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sameTx(a: TxState | null, b: TxState | null) {
  if (a === null || b === null) return a === b;
  return (
    sameDay(a.date, b.date) &&
    a.type === b.type &&
    a.description === b.description &&
    a.accountId === b.accountId &&
    a.categoryId === b.categoryId &&
    a.amount === b.amount &&
    a.direction === b.direction &&
    a.excluded === b.excluded &&
    a.excludedReason === b.excludedReason &&
    a.role === b.role &&
    a.repaymentId === b.repaymentId
  );
}

function sameDebt(a: DebtFields, b: DebtFields) {
  return (
    a.debtType === b.debtType &&
    a.accountId === b.accountId &&
    a.principalAmount === b.principalAmount &&
    sameDay(a.startDate, b.startDate) &&
    a.currentBalance === b.currentBalance &&
    a.borrowingTransactionId === b.borrowingTransactionId
  );
}

function stateOf(tx: LedgerTx): TxState {
  const { id: _id, ...state } = tx;
  void _id;
  return state;
}

function emptyMonth(): MonthDelta {
  return { income: 0, expense: 0, count: 0, categories: {}, borrowed: 0 };
}

/**
 * What one transaction contributes while it counts: the same math as
 * aggregation.ts's writeTransactionContribution (account balance in its own
 * currency, month income/expense/count and per-category progress in base).
 */
export function contribution(tx: TxState | null, accountCurrency: string, ctx: Pick<CurrencyContext, 'base' | 'rates'>) {
  if (!tx || tx.excluded) return null;
  const signed = tx.direction === 'Inflow' ? tx.amount : -tx.amount;
  const base = convert(signed, accountCurrency, ctx.base, ctx.rates);
  const income = base > 0 ? base : 0;
  const expense = base < 0 ? -base : 0;
  return {
    accountId: tx.accountId,
    month: monthKey(tx.date),
    signed,
    base,
    income,
    expense,
    categoryId: tx.categoryId,
    spend: tx.type === 'Income' ? income - expense : expense - income,
    borrowed: tx.role === 'borrowing' ? income : 0,
  };
}

function addEffects(plan: WalletPlan, change: TxChange, currencyOf: (accountId: string) => string, ctx: Pick<CurrencyContext, 'base' | 'rates'>) {
  for (const [side, sign] of [
    [change.before, -1],
    [change.after, 1],
  ] as const) {
    const c = contribution(side, side ? currencyOf(side.accountId) : ctx.base, ctx);
    if (!c) continue;
    plan.accounts[c.accountId] = round2((plan.accounts[c.accountId] ?? 0) + sign * c.signed);
    const m = (plan.months[c.month] ??= emptyMonth());
    m.income = round2(m.income + sign * c.income);
    m.expense = round2(m.expense + sign * c.expense);
    m.count += sign;
    m.borrowed = round2(m.borrowed + sign * c.borrowed);
    if (c.categoryId) {
      const cat = (m.categories[c.categoryId] ??= { spend: 0, count: 0 });
      cat.spend = round2(cat.spend + sign * c.spend);
      cat.count += sign;
    }
    plan.totalBalanceBase = round2(plan.totalBalanceBase + sign * c.base);
  }
}

function pruneZeros(plan: WalletPlan) {
  for (const [id, delta] of Object.entries(plan.accounts)) if (delta === 0) delete plan.accounts[id];
  for (const [key, m] of Object.entries(plan.months)) {
    for (const [cat, v] of Object.entries(m.categories)) if (v.spend === 0 && v.count === 0) delete m.categories[cat];
    if (m.income === 0 && m.expense === 0 && m.count === 0 && Object.keys(m.categories).length === 0) delete plan.months[key];
  }
}

export class WalletChangeError extends Error {}

/**
 * Plans one change against the debt's current state. Throws
 * WalletChangeError for a change that can't be made (no account, a frozen
 * account would move); everything else that deserves a second look is a
 * warning.
 */
export function planWalletChange(
  state: WalletState,
  change: WalletChange,
  ctx: Pick<CurrencyContext, 'base' | 'rates'>,
  now: Date,
  newId: () => string,
  format: (n: number) => string = defaultFormat
): WalletPlan {
  const { debt } = state;
  const before: DebtFields = {
    debtType: debt.debtType,
    accountId: debt.accountId,
    principalAmount: debt.principalAmount,
    startDate: debt.startDate,
    currentBalance: debt.currentBalance,
    borrowingTransactionId: debt.borrowingTransactionId,
  };
  const after: DebtFields = { ...before };
  const txChanges: TxChange[] = [];
  const repaymentLinks: WalletPlan['repaymentLinks'] = [];
  const warnings: string[] = [];
  const today = shortDay(now);
  const borrowingDescription = `Loan received: ${debt.name}`;

  const borrowingState = (fields: { date: Date; accountId: string; amount: number }): TxState => ({
    date: fields.date,
    type: 'Income',
    description: state.borrowing?.description ?? borrowingDescription,
    accountId: fields.accountId,
    categoryId: state.borrowing?.categoryId ?? null,
    amount: fields.amount,
    direction: 'Inflow',
    excluded: false,
    excludedReason: null,
    role: 'borrowing',
    repaymentId: null,
  });

  if (change.kind === 'toRecordOnly') {
    after.debtType = 'existing';
    after.accountId = null;
    if (state.borrowing && !state.borrowing.excluded) {
      const b = stateOf(state.borrowing);
      txChanges.push({ id: state.borrowing.id, before: b, after: { ...b, excluded: true, excludedReason: `Debt changed to record only on ${today}` } });
    }
    if (change.repayments === 'remove') {
      for (const tx of state.repaymentTxs) {
        if (tx.excluded) continue;
        const b = stateOf(tx);
        txChanges.push({
          id: tx.id,
          before: b,
          after: { ...b, excluded: true, excludedReason: `Repayment taken out of your balances when the debt changed to record only on ${today}` },
        });
      }
    }
  } else if (change.kind === 'toCash') {
    if (!change.accountId || !state.accounts[change.accountId]) throw new WalletChangeError('Choose the account the money was received into.');
    after.debtType = 'cash';
    after.accountId = change.accountId;
    const target = borrowingState({ date: change.receivedOn, accountId: change.accountId, amount: debt.principalAmount });
    if (state.borrowing) {
      txChanges.push({ id: state.borrowing.id, before: stateOf(state.borrowing), after: target });
    } else {
      const id = newId();
      after.borrowingTransactionId = id;
      txChanges.push({ id, before: null, after: target });
    }
    if (monthKey(change.receivedOn) !== monthKey(now)) {
      const month = monthName(monthKey(change.receivedOn), now);
      warnings.push(`This adds ${format(debt.principalAmount)} to ${month}'s income and changes ${month}'s figures.`);
    }
    if (change.repayments.fromAccounts) {
      const choice = change.repayments;
      const txById = new Map(state.repaymentTxs.map((tx) => [tx.id, tx]));
      for (const repayment of state.repayments) {
        const chosen = choice.perRepayment?.[repayment.id];
        const linked = repayment.transactionId ? txById.get(repayment.transactionId) : undefined;
        if (linked) {
          if (!linked.excluded && !chosen) continue;
          const b = stateOf(linked);
          txChanges.push({ id: linked.id, before: b, after: { ...b, excluded: false, excludedReason: null, accountId: chosen ?? linked.accountId } });
          continue;
        }
        const accountId = chosen ?? choice.accountId;
        if (!state.accounts[accountId]) throw new WalletChangeError('Choose the account the repayments were paid from.');
        const id = newId();
        txChanges.push({
          id,
          before: null,
          after: {
            date: repayment.date,
            type: 'Expense',
            description: `Repayment: ${debt.name}`,
            accountId,
            categoryId: null,
            amount: repayment.amount,
            direction: 'Outflow',
            excluded: false,
            excludedReason: null,
            role: 'repayment',
            repaymentId: repayment.id,
          },
        });
        repaymentLinks.push({ repaymentId: repayment.id, before: repayment.transactionId, after: id });
      }
    }
  } else {
    const amount = change.amount ?? debt.principalAmount;
    if (!(amount > 0)) throw new WalletChangeError('Enter an amount above zero.');
    after.principalAmount = round2(amount);
    if (change.date) after.startDate = change.date;
    if (debt.debtType === 'cash') {
      const accountId = change.accountId ?? debt.accountId;
      if (change.accountId && !state.accounts[change.accountId]) throw new WalletChangeError('Choose the account the money was received into.');
      after.accountId = accountId;
      const live = state.borrowing && !state.borrowing.excluded ? state.borrowing : null;
      if (live) {
        const target = borrowingState({ date: change.date ?? live.date, accountId: accountId ?? live.accountId, amount: after.principalAmount });
        txChanges.push({ id: live.id, before: stateOf(live), after: target });
        const from = monthKey(live.date);
        const to = monthKey(target.date);
        if (from !== to) {
          warnings.push(
            `This moves ${format(after.principalAmount)} of borrowed income from ${monthName(from, now)} to ${monthName(to, now)} and changes both months' figures.`
          );
        }
      } else if (!debt.accountId && accountId) {
        // A cash debt that never had an account: choosing one now records
        // the money arriving there, as creating the debt would have.
        const id = newId();
        after.borrowingTransactionId = id;
        txChanges.push({ id, before: null, after: borrowingState({ date: change.date ?? debt.startDate, accountId, amount: after.principalAmount }) });
      } else if (amount !== debt.principalAmount || change.accountId || change.date) {
        warnings.push('No borrowing transaction is linked to this debt, so your balances don’t change.');
      }
    }
  }

  // Balance owed is principal minus repayments, whatever the type.
  after.currentBalance = Math.max(0, round2(after.principalAmount - debt.totalRepaid));

  const plan: WalletPlan = {
    kind: change.kind,
    txChanges: txChanges.filter((c) => !sameTx(c.before, c.after)),
    repaymentLinks: repaymentLinks.filter((l) => l.before !== l.after),
    debt: { before, after },
    accounts: {},
    months: {},
    totalBalanceBase: 0,
    lines: [],
    warnings,
    noop: false,
  };

  const currencyOf = (accountId: string) => state.accounts[accountId]?.currency ?? ctx.base;
  for (const c of plan.txChanges) addEffects(plan, c, currencyOf, ctx);
  pruneZeros(plan);

  for (const [accountId, delta] of Object.entries(plan.accounts)) {
    const account = state.accounts[accountId];
    if (account?.frozen) throw new WalletChangeError(`${account.name} is frozen. Unfreeze it before making this change.`);
    if (account && delta < 0 && account.lockedAmount > 0 && account.balance + delta < account.lockedAmount) {
      throw new WalletChangeError(`This would dip into the amount locked in ${account.name}. Unlock some of it first.`);
    }
    if (account && account.balance + delta < 0) {
      warnings.push(`${account.name} would go below zero (${format(account.balance + delta)}).`);
    }
  }

  plan.noop = plan.txChanges.length === 0 && plan.repaymentLinks.length === 0 && sameDebt(before, after);
  plan.lines = describePlan(plan, state, now, format);
  return plan;
}

/**
 * Deleting a debt: allowed only before any repayment (repayments are
 * history; archive keeps them). Its borrowing transaction is deleted with
 * it, reversing what it added to the wallet and the month.
 */
export function planDeleteDebt(state: WalletState, ctx: Pick<CurrencyContext, 'base' | 'rates'>, now: Date, format: (n: number) => string = defaultFormat): WalletPlan {
  if (state.repayments.length > 0) throw new WalletChangeError('This debt has repayments. Archive it instead, so they stay in its history.');
  const { debt } = state;
  const fields: DebtFields = {
    debtType: debt.debtType,
    accountId: debt.accountId,
    principalAmount: debt.principalAmount,
    startDate: debt.startDate,
    currentBalance: debt.currentBalance,
    borrowingTransactionId: debt.borrowingTransactionId,
  };
  const plan: WalletPlan = {
    kind: 'edit',
    txChanges: state.borrowing ? [{ id: state.borrowing.id, before: stateOf(state.borrowing), after: null }] : [],
    repaymentLinks: [],
    debt: { before: fields, after: fields },
    accounts: {},
    months: {},
    totalBalanceBase: 0,
    lines: [],
    warnings: [],
    noop: false,
  };
  for (const c of plan.txChanges) addEffects(plan, c, (id) => state.accounts[id]?.currency ?? ctx.base, ctx);
  pruneZeros(plan);
  for (const id of Object.keys(plan.accounts)) {
    if (state.accounts[id]?.frozen) throw new WalletChangeError(`${state.accounts[id].name} is frozen. Unfreeze it before deleting this debt.`);
  }
  plan.lines = describePlan(plan, state, now, format).filter((line) => !line.startsWith('What you owe'));
  if (plan.txChanges.length) plan.lines.push('The borrowing transaction is deleted.');
  plan.lines.push(`${format(debt.currentBalance)} leaves what you owe.`);
  return plan;
}

/** The preview: balances, months, transactions and what's owed, in words. */
export function describePlan(plan: WalletPlan, state: WalletState, now: Date, format: (n: number) => string = defaultFormat): string[] {
  if (plan.noop) return ['Nothing changes.'];
  const lines: string[] = [];
  for (const [accountId, delta] of Object.entries(plan.accounts)) {
    const account = state.accounts[accountId];
    if (!account) continue;
    lines.push(`${account.name} balance goes from ${format(account.balance)} to ${format(round2(account.balance + delta))}.`);
  }
  for (const key of Object.keys(plan.months).sort()) {
    const m = plan.months[key];
    const name = monthName(key, now);
    if (m.income !== 0) {
      const borrowedOnly = m.borrowed === m.income;
      lines.push(`${name} income ${m.income < 0 ? 'drops' : 'rises'} by ${format(Math.abs(m.income))}${borrowedOnly ? ' (borrowed)' : ''}.`);
    }
    if (m.expense !== 0) {
      lines.push(`${name} spending ${m.expense < 0 ? 'drops' : 'rises'} by ${format(Math.abs(m.expense))} (repayments).`);
    }
  }
  const excluded = plan.txChanges.filter((c) => c.before && !c.before.excluded && c.after?.excluded);
  const included = plan.txChanges.filter((c) => c.before?.excluded && c.after && !c.after.excluded);
  const created = plan.txChanges.filter((c) => c.before === null && c.after);
  const count = (list: TxChange[], role: TxState['role']) => list.filter((c) => (c.after ?? c.before)!.role === role).length;
  const words = (n: number, role: TxState['role']) =>
    role === 'borrowing' ? 'The borrowing transaction' : `${n} repayment ${n === 1 ? 'transaction' : 'transactions'}`;
  for (const role of ['borrowing', 'repayment'] as const) {
    const ex = count(excluded, role);
    if (ex) lines.push(`${words(ex, role)} ${ex === 1 ? 'is' : 'are'} excluded from your figures (kept under "Show excluded").`);
    const inc = count(included, role);
    if (inc) lines.push(`${words(inc, role)} ${inc === 1 ? 'counts' : 'count'} again.`);
    const cr = count(created, role);
    if (cr) {
      if (role === 'borrowing') {
        const tx = created.find((c) => c.after!.role === 'borrowing')!.after!;
        lines.push(`A borrowing transaction of ${format(tx.amount)} is created on ${shortDay(tx.date)}.`);
      } else {
        lines.push(`${cr} repayment ${cr === 1 ? 'transaction is' : 'transactions are'} created.`);
      }
    }
  }
  const { before, after } = plan.debt;
  if (before.principalAmount !== after.principalAmount) {
    lines.push(`What you owe goes from ${format(before.currentBalance)} to ${format(after.currentBalance)}.`);
  } else if (before.debtType !== after.debtType) {
    lines.push(`What you owe stays ${format(after.currentBalance)}.`);
  }
  if (lines.length === 0) lines.push('Your balances and figures don’t change.');
  return lines;
}

/** The plan that undoes `plan`: every pair swapped, every effect negated. */
export function invertPlan(plan: WalletPlan): WalletPlan {
  const months: Record<string, MonthDelta> = {};
  for (const [key, m] of Object.entries(plan.months)) {
    months[key] = {
      income: -m.income,
      expense: -m.expense,
      count: -m.count,
      borrowed: -m.borrowed,
      categories: Object.fromEntries(Object.entries(m.categories).map(([id, v]) => [id, { spend: -v.spend, count: -v.count }])),
    };
  }
  return {
    ...plan,
    txChanges: plan.txChanges.map((c) => ({ id: c.id, before: c.after, after: c.before })).reverse(),
    repaymentLinks: plan.repaymentLinks.map((l) => ({ repaymentId: l.repaymentId, before: l.after, after: l.before })),
    debt: { before: plan.debt.after, after: plan.debt.before },
    accounts: Object.fromEntries(Object.entries(plan.accounts).map(([id, d]) => [id, -d])),
    months,
    totalBalanceBase: -plan.totalBalanceBase,
    warnings: [],
  };
}

// ---------------------------------------------------------------------
// The words for the activity log.
// ---------------------------------------------------------------------

export const WALLET_EFFECT_LABEL: Record<DebtKind, string> = { cash: 'Cash debt', existing: 'Record only' };

export interface ActivityChange {
  label: string;
  from: string;
  to: string;
}

export function describeChange(
  plan: WalletPlan,
  accountName: (id: string | null) => string,
  format: (n: number) => string = defaultFormat
): { title: string; changes: ActivityChange[] } {
  const { before, after } = plan.debt;
  const changes: ActivityChange[] = [];
  if (before.debtType !== after.debtType) changes.push({ label: 'Type', from: WALLET_EFFECT_LABEL[before.debtType], to: WALLET_EFFECT_LABEL[after.debtType] });
  if (before.principalAmount !== after.principalAmount) changes.push({ label: 'Amount', from: format(before.principalAmount), to: format(after.principalAmount) });
  if (before.accountId !== after.accountId && after.debtType === 'cash') changes.push({ label: 'Received into', from: accountName(before.accountId), to: accountName(after.accountId) });
  if (!sameDay(before.startDate, after.startDate)) changes.push({ label: 'Borrowed on', from: shortDay(before.startDate), to: shortDay(after.startDate) });
  const borrowing = plan.txChanges.find((c) => (c.after ?? c.before)?.role === 'borrowing');
  if (plan.kind === 'toCash' && borrowing?.after && !changes.some((c) => c.label === 'Borrowed on')) {
    changes.push({ label: 'Received on', from: borrowing.before ? shortDay(borrowing.before.date) : 'None', to: shortDay(borrowing.after.date) });
  }
  const title =
    plan.kind === 'toRecordOnly'
      ? 'Changed to record only'
      : plan.kind === 'toCash'
        ? 'Changed to cash debt'
        : changes.length === 1
          ? `${changes[0].label} changed`
          : 'Debt edited';
  return { title, changes };
}
