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
