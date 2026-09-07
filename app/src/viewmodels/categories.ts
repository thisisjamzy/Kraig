// Transfer "categories" aren't spending categories, and Transfers isn't a
// Categories-tab TransactionType — they just describe which direction the
// money is moving between accounts (Transfers!Kind, see SCHEMA.md). This is
// the one category-like list with no callAppsScript action behind it, since
// it's a small fixed enum rather than user-editable data.
export const TRANSFER_CATEGORIES = [
  'Wallet to wallet',
  'Wallet to savings',
  'Savings to wallet',
] as const;

// One-tap starting points for onboarding's "create your categories" step
// (src/logic/onboarding/useLogic.ts) — same set scripts/seed-dummy-data.ts
// uses, just names to prefill the create-category form, never written
// directly (the user can rename/drop any of them before saving).
export const CATEGORY_PRESETS: { name: string; transactionType: 'Expense' | 'Income' | 'Savings' }[] = [
  { name: 'Groceries', transactionType: 'Expense' },
  { name: 'Transport', transactionType: 'Expense' },
  { name: 'Rent', transactionType: 'Expense' },
  { name: 'Utilities', transactionType: 'Expense' },
  { name: 'Entertainment', transactionType: 'Expense' },
  { name: 'Dining Out', transactionType: 'Expense' },
  { name: 'Health', transactionType: 'Expense' },
  { name: 'Shopping', transactionType: 'Expense' },
  { name: 'Subscriptions', transactionType: 'Expense' },
  { name: 'Salary', transactionType: 'Income' },
  { name: 'Freelance', transactionType: 'Income' },
  { name: 'Emergency Fund', transactionType: 'Savings' },
  { name: 'Investments', transactionType: 'Savings' },
];

// Light backdrop colors for a transaction row's leading icon circle, keyed
// by the row's own category/transfer-kind label (not the account, and not
// list position) so the same category always lands on the same color no
// matter which screen built the row — Home's recent transactions, Budget's
// month panel, the Transactions list, and a category's own drill-down each
// build their row list independently, so only a label-keyed color stays
// consistent across all of them. Deliberately light (a fixed dark icon
// glyph sits on top, see the callers) rather than the app's usual vivid
// per-account palette (src/viewmodels/wallets.ts's WALLET_COLORS) — the
// point here is visual variety across categories, not encoding meaning.
const CATEGORY_ACCENT_COLORS = [
  '#FDE2E2',
  '#FDEBD3',
  '#FEF6D8',
  '#E3F5D0',
  '#D6F5F0',
  '#D9EEFB',
  '#E3DEFB',
  '#FBE0F5',
  '#F3E5D8',
  '#DDEDEA',
  '#FADADD',
  '#E0F0DA',
] as const;

// Black, not white — the icon glyph always sits on one of the light
// backgrounds above regardless of the app's own light/dark theme (the
// circle's background never follows the theme), and only a dark glyph
// keeps proper contrast against them.
export const CATEGORY_ICON_COLOR = '#000000';

export function categoryAccentColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return CATEGORY_ACCENT_COLORS[Math.abs(hash) % CATEGORY_ACCENT_COLORS.length];
}
