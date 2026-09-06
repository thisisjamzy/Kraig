// Accounts have no color of their own in the Sheet — accounts.list doesn't
// return one — so Home's and Wallets' bar charts cycle through this fixed
// palette by list position instead. Not placeholder data: this is real
// presentation config, kept even after wiring to the live API.
export const WALLET_COLORS = [
  '#7b7ef3',
  '#f88686',
  '#ff9800',
  'var(--ink-bg)',
  '#0097a7',
  '#3a81f8',
  '#fac021',
] as const;

export function walletColor(index: number) {
  return WALLET_COLORS[index % WALLET_COLORS.length];
}

/**
 * Reorders items (already sorted by whatever should peak in the middle,
 * largest first) into a center-outward "normal distribution" layout for a
 * bar chart — the largest bar in the middle column, the next two flanking
 * it on either side, and so on out to the smallest bars at the two edges.
 * Used for Home's wallet balances chart so the tallest bar reads as the
 * peak of a bell curve rather than sitting wherever its account happened to
 * be created.
 */
export function arrangeCentered<T>(sortedDescending: T[]): T[] {
  const n = sortedDescending.length;
  const result = new Array<T>(n);
  let left = Math.floor((n - 1) / 2);
  let right = left + 1;
  let placeLeft = true;
  for (const item of sortedDescending) {
    if (placeLeft) {
      result[left] = item;
      left -= 1;
    } else {
      result[right] = item;
      right += 1;
    }
    placeLeft = !placeLeft;
  }
  return result;
}

// sheets/SCHEMA.md's Accounts.Type dropdown, carried over as the fixed enum
// the "Add wallet" form offers — a free-text field elsewhere in the schema,
// but a dropdown here keeps new accounts consistent with existing ones.
export const ACCOUNT_TYPES = [
  'Cash',
  'Savings Account',
  'Debit Card',
  'Mobile Money',
  'E-wallet',
  'Current Account',
] as const;

// The one ACCOUNT_TYPES value with special behavior: money can always flow
// INTO a Savings Account (a transaction crediting it, or a transfer whose
// toAccountId is one), but it can never fund a direct Expense — see
// src/logic/addTransaction/useLogic.ts and src/logic/editTransaction/
// useLogic.ts, which both filter it out of the "which wallet is this
// spent from" picker. Moving money back out to a spendable wallet is a
// deliberate Transfer (still allowed, since a Transfer's own fromAccountId
// isn't a "direct spend"). "Total savings" everywhere in the app (Budget,
// Statistics, Home) is just the live balance sum of accounts of this type —
// see src/viewmodels/savingsTransfers.ts.
export const SAVINGS_ACCOUNT_TYPE = 'Savings Account';

export function isSavingsAccount(account: { type: string }): boolean {
  return account.type === SAVINGS_ACCOUNT_TYPE;
}
