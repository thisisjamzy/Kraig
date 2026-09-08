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

// Pastel gradient variant of each WALLET_COLORS entry, same index-to-hue
// mapping — used only for the wallet card's own background (Home's card
// list), where the card text is dark (not white), so the background needs
// to stay light enough for that to stay readable across the whole gradient.
// WALLET_COLORS itself stays untouched everywhere else (dots, legends),
// which is dark text on the app's own light/dark surface, not on the
// swatch itself.
const WALLET_CARD_COLORS = [
  'linear-gradient(135deg, #e8e9fd, #c9caf7)',
  'linear-gradient(135deg, #fde8e8, #f7c9c9)',
  'linear-gradient(135deg, #fff0d9, #ffd699)',
  'linear-gradient(135deg, #f0f0f2, #d3d3da)',
  'linear-gradient(135deg, #e0f7f9, #a9e4e8)',
  'linear-gradient(135deg, #e8f0fe, #b9d0fb)',
  'linear-gradient(135deg, #fff6d9, #fce18f)',
] as const;

export function walletCardColor(index: number) {
  return WALLET_CARD_COLORS[index % WALLET_CARD_COLORS.length];
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

// FNV-1a, 32-bit — deterministic and dependency-free, just needs to spread
// an account id across enough bits to look non-sequential once formatted.
function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A stable, cosmetic 16-digit "wallet number" derived from the account's
 * own id (Design/card design.jpg's "CARD NUMBER") — this app has no real
 * card issuing, so it's never a real PAN. Hashed twice with different
 * seeds for ~64 bits of spread, then formatted as four groups of four.
 * Always starts with 8 — never a real network's own leading digit (Visa's
 * 4, or Mastercard's 51-55 / 2221-2720) — so it can never be mistaken for
 * an actual Visa or Mastercard number.
 */
export function walletCardNumber(id: string): string {
  const a = fnv1a(id, 2166136261);
  const b = fnv1a(`${id}:2`, 0x811c9dc5);
  const combined = (BigInt(a) * BigInt(4294967296) + BigInt(b)).toString().padStart(20, '0').slice(0, 15);
  const digits = `8${combined}`;
  return digits.match(/.{1,4}/g)!.join(' ');
}
