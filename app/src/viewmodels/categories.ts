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
