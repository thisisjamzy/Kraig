// The single source of truth for the Settings > Data feature (export,
// template download, import). Every entity this household's data can
// contain gets one EntityDef here: its Excel column shape, how to turn a
// live Firestore doc into a spreadsheet row (export), how to turn a
// spreadsheet row back into a validated draft (import), and which of that
// draft's fields are name-based references to another entity that might
// need resolving (existing match, or offered as an auto-create) before any
// write happens.
//
// This module is pure — no Firestore reads/writes, no React, no `xlsx`
// import. src/shared/firestore/dataWorkbook.ts builds/reads the actual
// spreadsheet using these definitions; src/logic/importData/useLogic.ts
// resolves references and performs the writes.

import type {
  Priority,
  DebtPriority,
  TaskType,
  TaskStatus,
  ProjectStatus,
  GoalItemNecessity,
} from './types';

export type EntityKey =
  | 'areas'
  | 'buckets'
  | 'accounts'
  | 'categories'
  | 'budgets'
  | 'projects'
  | 'tasks'
  | 'goals'
  | 'goalItems'
  | 'debts'
  | 'repayments'
  | 'transactions'
  | 'transfers';

// Dependency order: every entity a later one can reference by name appears
// before it — the import commit step, and the reference-resolution pass
// before it, both walk this exact order.
export const ENTITY_ORDER: EntityKey[] = [
  'areas',
  'buckets',
  'accounts',
  'categories',
  'budgets',
  'projects',
  'tasks',
  'goals',
  'goalItems',
  'debts',
  'repayments',
  'transactions',
  'transfers',
];

export interface RefNeed {
  // The draft field this reference will populate once resolved (e.g. 'accountId').
  field: string;
  entityKey: EntityKey;
  name: string;
  // hardRequired: unresolved means the row is skipped, no prompt — used
  // only for money/identity fields (accounts, the debt a repayment is
  // against) too important to guess at.
  // autoCreate: unresolved means the user is asked, once per unique name,
  // whether to create it.
  mode: 'hardRequired' | 'autoCreate';
  // Only meaningful for mode: 'autoCreate' — what happens to the row if
  // the user declines to create the missing entity.
  onDecline?: 'null' | 'skipRow';
}

export interface ParsedRow<TDraft> {
  rowNumber: number;
  draft: TDraft | null;
  refs: RefNeed[];
  errors: string[];
}

export interface EntityDef<TDraft = Record<string, unknown>> {
  key: EntityKey;
  label: string;
  // Excel sheet names: <=31 chars, no : \ / ? * [ ]
  sheetName: string;
  columns: string[];
  templateRows: string[][];
  parseRow: (row: Record<string, unknown>, rowNumber: number) => ParsedRow<TDraft>;
}

// ---------------------------------------------------------------------------
// Small parsing primitives — every parseRow below is built from these.
// ---------------------------------------------------------------------------

function cell(row: Record<string, unknown>, header: string): string {
  const value = row[header];
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function optionalCell(row: Record<string, unknown>, header: string): string | null {
  const value = cell(row, header);
  return value ? value : null;
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Accepts a real Date (xlsx's cellDates:true gives us these directly for
// .xlsx uploads) or a "YYYY-MM-DD"/parsable string (a .csv upload, or a
// spreadsheet cell formatted as plain text).
function parseDateCell(row: Record<string, unknown>, header: string): Date | null {
  const raw = row[header];
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const str = cell(row, header);
  if (!str) return null;
  const withTime = str.length <= 10 ? `${str}T00:00:00` : str;
  const date = new Date(withTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseBool(value: string, fallback = false): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === 'yes' || v === '1';
}

function boolLabel(value: boolean | undefined): string {
  return value ? 'TRUE' : 'FALSE';
}

function parseEnum<T extends string>(value: string, options: readonly T[], fallback: T): { value: T; error?: string } {
  const match = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
  if (match) return { value: match };
  if (!value.trim()) return { value: fallback };
  return { value: fallback, error: `must be one of ${options.join(', ')} — got "${value}"` };
}

function isRowBlank(row: Record<string, unknown>, columns: string[]): boolean {
  return columns.every((c) => !cell(row, c));
}

// ---------------------------------------------------------------------------
// Draft shapes — one per entity, exactly the fields the import commit step
// (src/logic/importData/useLogic.ts) needs to perform its write.
// ---------------------------------------------------------------------------

export interface AreaDraft {
  name: string;
  emoji: string | null;
  color: string;
  description: string;
  archived: boolean;
}

export interface BucketDraft {
  name: string;
  areaName: string;
  emoji: string | null;
  color: string;
  description: string;
  archived: boolean;
}

export interface AccountDraft {
  name: string;
  type: string;
  currency: string;
  startingBalance: number;
  notes: string;
  archived: boolean;
  notSpendable: boolean;
  frozen: boolean;
}

export interface CategoryDraft {
  name: string;
  transactionType: 'Expense' | 'Income' | 'Savings';
  group: string | null;
  notes: string;
  archived: boolean;
}

export interface BudgetDraft {
  categoryName: string;
  description: string;
  budgetedAmount: number;
  frequency: 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  accountName: string | null;
  tag: string | null;
  archived: boolean;
}

export interface ProjectDraft {
  name: string;
  areaName: string | null;
  bucketName: string | null;
  color: string;
  priority: Priority;
  startDate: Date | null;
  endDate: Date | null;
  status: ProjectStatus;
  description: string;
}

export interface TaskDraft {
  title: string;
  projectName: string | null;
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  startTime: Date | null;
  dueDate: Date | null;
  notes: string;
  tags: string[];
}

export interface GoalDraft {
  name: string;
  description: string;
  currency: string;
  deadline: Date | null;
  archived: boolean;
}

export interface GoalItemDraft {
  goalName: string;
  name: string;
  description: string;
  amount: number;
  priority: Priority;
  necessity: GoalItemNecessity;
  completed: boolean;
}

export interface DebtDraft {
  name: string;
  description: string;
  debtType: 'cash' | 'existing';
  accountName: string | null;
  principalAmount: number;
  currency: string;
  priority: DebtPriority;
  startDate: Date;
  notes: string;
}

export interface RepaymentDraft {
  debtName: string;
  amount: number;
  date: Date;
  method: 'manual' | 'planned';
  notes: string;
  accountName: string | null;
}

export interface TransactionDraft {
  date: Date;
  type: 'Expense' | 'Income' | 'Savings';
  accountName: string;
  categoryName: string | null;
  amount: number;
  description: string;
}

export interface TransferDraft {
  date: Date;
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  charges: number;
  kind: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Entity definitions
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'] as const;
const DEBT_PRIORITY_OPTIONS = ['low', 'medium', 'high'] as const;
const TASK_TYPE_OPTIONS = ['ToDo', 'Meeting', 'Event'] as const;
const TASK_STATUS_OPTIONS = ['Pending', 'Stuck', 'In Review', 'Done'] as const;
const PROJECT_STATUS_OPTIONS = ['Active', 'Completed', 'Archived'] as const;
const CATEGORY_TYPE_OPTIONS = ['Expense', 'Income', 'Savings'] as const;
const BUDGET_FREQUENCY_OPTIONS = ['Once', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'] as const;
const NECESSITY_OPTIONS = ['MustHave', 'NiceToHave'] as const;
const DEBT_TYPE_OPTIONS = ['cash', 'existing'] as const;
const REPAYMENT_METHOD_OPTIONS = ['manual', 'planned'] as const;

export const AREA_ENTITY: EntityDef<AreaDraft> = {
  key: 'areas',
  label: 'Areas',
  sheetName: 'Areas',
  columns: ['Name', 'Emoji', 'Color', 'Description', 'Archived'],
  templateRows: [['Home', '🏠', '#7b7ef3', 'Everything about running the house', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const description = cell(row, 'Description');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!description) errors.push('Description is required.');
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    return {
      rowNumber,
      draft: {
        name,
        emoji: optionalCell(row, 'Emoji'),
        color: cell(row, 'Color') || '#7b7ef3',
        description,
        archived: parseBool(cell(row, 'Archived')),
      },
      refs: [],
      errors: [],
    };
  },
};

export const BUCKET_ENTITY: EntityDef<BucketDraft> = {
  key: 'buckets',
  label: 'Buckets',
  sheetName: 'Buckets',
  columns: ['Name', 'Area', 'Emoji', 'Color', 'Description', 'Archived'],
  templateRows: [['Groceries', 'Home', '🛒', '#8bc34a', 'Weekly food shopping', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const areaName = cell(row, 'Area');
    const description = cell(row, 'Description');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!areaName) errors.push('Area is required.');
    if (!description) errors.push('Description is required.');
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const draft: BucketDraft = {
      name,
      areaName,
      emoji: optionalCell(row, 'Emoji'),
      color: cell(row, 'Color') || '#8bc34a',
      description,
      archived: parseBool(cell(row, 'Archived')),
    };
    return {
      rowNumber,
      draft,
      refs: [{ field: 'areaId', entityKey: 'areas', name: areaName, mode: 'autoCreate', onDecline: 'skipRow' }],
      errors: [],
    };
  },
};

export const ACCOUNT_ENTITY: EntityDef<AccountDraft> = {
  key: 'accounts',
  label: 'Accounts',
  sheetName: 'Accounts',
  columns: [
    'Name',
    'Type',
    'Currency',
    'Starting Balance',
    'Notes',
    'Archived',
    'Not Spendable',
    'Frozen',
  ],
  templateRows: [['Cash Wallet', 'Cash', 'XAF', '50000', '', 'FALSE', 'FALSE', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const currency = cell(row, 'Currency');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!currency) errors.push('Currency is required.');
    const startingBalance = parseNumber(cell(row, 'Starting Balance')) ?? 0;
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    return {
      rowNumber,
      draft: {
        name,
        type: cell(row, 'Type') || 'Cash',
        currency,
        startingBalance,
        notes: cell(row, 'Notes'),
        archived: parseBool(cell(row, 'Archived')),
        notSpendable: parseBool(cell(row, 'Not Spendable')),
        frozen: parseBool(cell(row, 'Frozen')),
      },
      refs: [],
      errors: [],
    };
  },
};

export const CATEGORY_ENTITY: EntityDef<CategoryDraft> = {
  key: 'categories',
  label: 'Categories',
  sheetName: 'Categories',
  columns: ['Name', 'Type', 'Group', 'Notes', 'Archived'],
  templateRows: [['Groceries', 'Expense', '', '', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    const type = parseEnum(cell(row, 'Type'), CATEGORY_TYPE_OPTIONS, 'Expense');
    if (type.error) errors.push(`Type ${type.error}`);
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    return {
      rowNumber,
      draft: {
        name,
        transactionType: type.value,
        group: optionalCell(row, 'Group'),
        notes: cell(row, 'Notes'),
        archived: parseBool(cell(row, 'Archived')),
      },
      refs: [],
      errors: [],
    };
  },
};

export const BUDGET_ENTITY: EntityDef<BudgetDraft> = {
  key: 'budgets',
  label: 'Budgets',
  sheetName: 'Budgets',
  columns: ['Category', 'Description', 'Budgeted Amount', 'Frequency', 'Account', 'Tag', 'Archived'],
  templateRows: [['Groceries', 'Monthly food budget', '150000', 'Monthly', '', '', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const categoryName = cell(row, 'Category');
    const errors: string[] = [];
    if (!categoryName) errors.push('Category is required.');
    const budgetedAmount = parseNumber(cell(row, 'Budgeted Amount'));
    if (budgetedAmount === null) errors.push('Budgeted Amount must be a number.');
    const frequency = parseEnum(cell(row, 'Frequency'), BUDGET_FREQUENCY_OPTIONS, 'Monthly');
    if (frequency.error) errors.push(`Frequency ${frequency.error}`);
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const accountName = optionalCell(row, 'Account');
    const draft: BudgetDraft = {
      categoryName,
      description: cell(row, 'Description'),
      budgetedAmount: budgetedAmount!,
      frequency: frequency.value,
      accountName,
      tag: optionalCell(row, 'Tag'),
      archived: parseBool(cell(row, 'Archived')),
    };
    const refs: RefNeed[] = [
      { field: 'categoryId', entityKey: 'categories', name: categoryName, mode: 'autoCreate', onDecline: 'skipRow' },
    ];
    if (accountName) refs.push({ field: 'accountId', entityKey: 'accounts', name: accountName, mode: 'hardRequired' });
    return { rowNumber, draft, refs, errors: [] };
  },
};

export const PROJECT_ENTITY: EntityDef<ProjectDraft> = {
  key: 'projects',
  label: 'Projects',
  sheetName: 'Projects',
  columns: ['Name', 'Area', 'Bucket', 'Color', 'Priority', 'Start Date', 'End Date', 'Status', 'Description'],
  templateRows: [
    ['Repaint the fence', 'Home', 'Maintenance', '#ff9800', 'Medium', '2026-03-01', '2026-03-15', 'Active', 'Repaint the back fence before summer'],
  ],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const description = cell(row, 'Description');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!description) errors.push('Description is required.');
    const priority = parseEnum(cell(row, 'Priority'), PRIORITY_OPTIONS, 'Medium');
    if (priority.error) errors.push(`Priority ${priority.error}`);
    const status = parseEnum(cell(row, 'Status'), PROJECT_STATUS_OPTIONS, 'Active');
    if (status.error) errors.push(`Status ${status.error}`);
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const areaName = optionalCell(row, 'Area');
    const bucketName = optionalCell(row, 'Bucket');
    const draft: ProjectDraft = {
      name,
      areaName,
      bucketName,
      color: cell(row, 'Color') || '#7b7ef3',
      priority: priority.value,
      startDate: parseDateCell(row, 'Start Date'),
      endDate: parseDateCell(row, 'End Date'),
      status: status.value,
      description,
    };
    const refs: RefNeed[] = [];
    if (areaName) refs.push({ field: 'areaId', entityKey: 'areas', name: areaName, mode: 'autoCreate', onDecline: 'skipRow' });
    if (bucketName) refs.push({ field: 'bucketId', entityKey: 'buckets', name: bucketName, mode: 'autoCreate', onDecline: 'null' });
    return { rowNumber, draft, refs, errors: [] };
  },
};

export const TASK_ENTITY: EntityDef<TaskDraft> = {
  key: 'tasks',
  label: 'Tasks',
  sheetName: 'Tasks',
  columns: ['Title', 'Project', 'Type', 'Priority', 'Status', 'Start Time', 'Due Date', 'Notes', 'Tags'],
  templateRows: [
    ['Buy paint', 'Repaint the fence', 'ToDo', 'Medium', 'Pending', '2026-03-01 09:00', '2026-03-02 18:00', 'Get exterior paint', 'errands'],
  ],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const title = cell(row, 'Title');
    const errors: string[] = [];
    if (!title) errors.push('Title is required.');
    const type = parseEnum(cell(row, 'Type'), TASK_TYPE_OPTIONS, 'ToDo');
    if (type.error) errors.push(`Type ${type.error}`);
    const priority = parseEnum(cell(row, 'Priority'), PRIORITY_OPTIONS, 'Medium');
    if (priority.error) errors.push(`Priority ${priority.error}`);
    const status = parseEnum(cell(row, 'Status'), TASK_STATUS_OPTIONS, 'Pending');
    if (status.error) errors.push(`Status ${status.error}`);
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const projectName = optionalCell(row, 'Project');
    const tagsStr = cell(row, 'Tags');
    const draft: TaskDraft = {
      title,
      projectName,
      type: type.value,
      priority: priority.value,
      status: status.value,
      startTime: parseDateCell(row, 'Start Time'),
      dueDate: parseDateCell(row, 'Due Date'),
      notes: cell(row, 'Notes'),
      tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    const refs: RefNeed[] = [];
    if (projectName) refs.push({ field: 'projectId', entityKey: 'projects', name: projectName, mode: 'autoCreate', onDecline: 'null' });
    return { rowNumber, draft, refs, errors: [] };
  },
};

export const GOAL_ENTITY: EntityDef<GoalDraft> = {
  key: 'goals',
  label: 'Goals',
  sheetName: 'Goals',
  columns: ['Name', 'Description', 'Currency', 'Deadline', 'Archived'],
  templateRows: [['New laptop', 'Save up for a work laptop', 'XAF', '2026-12-31', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const currency = cell(row, 'Currency');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!currency) errors.push('Currency is required.');
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    return {
      rowNumber,
      draft: {
        name,
        description: cell(row, 'Description'),
        currency,
        deadline: parseDateCell(row, 'Deadline'),
        archived: parseBool(cell(row, 'Archived')),
      },
      refs: [],
      errors: [],
    };
  },
};

export const GOAL_ITEM_ENTITY: EntityDef<GoalItemDraft> = {
  key: 'goalItems',
  label: 'Goal items',
  sheetName: 'Goal Items',
  columns: ['Goal', 'Name', 'Description', 'Amount', 'Priority', 'Necessity', 'Completed'],
  templateRows: [['New laptop', 'Laptop body', '', '600000', 'High', 'MustHave', 'FALSE']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const goalName = cell(row, 'Goal');
    const name = cell(row, 'Name');
    const errors: string[] = [];
    if (!goalName) errors.push('Goal is required.');
    if (!name) errors.push('Name is required.');
    const amount = parseNumber(cell(row, 'Amount'));
    if (amount === null) errors.push('Amount must be a number.');
    const priority = parseEnum(cell(row, 'Priority'), PRIORITY_OPTIONS, 'Medium');
    if (priority.error) errors.push(`Priority ${priority.error}`);
    const necessity = parseEnum(cell(row, 'Necessity'), NECESSITY_OPTIONS, 'NiceToHave');
    if (necessity.error) errors.push(`Necessity ${necessity.error}`);
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const draft: GoalItemDraft = {
      goalName,
      name,
      description: cell(row, 'Description'),
      amount: amount!,
      priority: priority.value,
      necessity: necessity.value,
      completed: parseBool(cell(row, 'Completed')),
    };
    return {
      rowNumber,
      draft,
      refs: [{ field: 'goalId', entityKey: 'goals', name: goalName, mode: 'autoCreate', onDecline: 'skipRow' }],
      errors: [],
    };
  },
};

export const DEBT_ENTITY: EntityDef<DebtDraft> = {
  key: 'debts',
  label: 'Debts',
  sheetName: 'Debts',
  columns: [
    'Name',
    'Description',
    'Debt Type',
    'Account',
    'Principal Amount',
    'Currency',
    'Priority',
    'Start Date',
    'Notes',
  ],
  templateRows: [['Car loan', 'Loan for the family car', 'existing', '', '2000000', 'XAF', 'medium', '2025-06-01', '']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const name = cell(row, 'Name');
    const currency = cell(row, 'Currency');
    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!currency) errors.push('Currency is required.');
    const principalAmount = parseNumber(cell(row, 'Principal Amount'));
    if (principalAmount === null) errors.push('Principal Amount must be a number.');
    const debtType = parseEnum(cell(row, 'Debt Type'), DEBT_TYPE_OPTIONS, 'existing');
    if (debtType.error) errors.push(`Debt Type ${debtType.error}`);
    const priority = parseEnum(cell(row, 'Priority'), DEBT_PRIORITY_OPTIONS, 'medium');
    if (priority.error) errors.push(`Priority ${priority.error}`);
    const startDate = parseDateCell(row, 'Start Date');
    if (!startDate) errors.push('Start Date is required and must be a valid date.');
    if (debtType.value === 'cash' && !cell(row, 'Account')) {
      errors.push('A cash debt needs an Account (the wallet the money lands in).');
    }
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const accountName = optionalCell(row, 'Account');
    const draft: DebtDraft = {
      name,
      description: cell(row, 'Description'),
      debtType: debtType.value,
      accountName,
      principalAmount: principalAmount!,
      currency,
      priority: priority.value,
      startDate: startDate!,
      notes: cell(row, 'Notes'),
    };
    const refs: RefNeed[] = [];
    if (accountName) refs.push({ field: 'accountId', entityKey: 'accounts', name: accountName, mode: 'hardRequired' });
    return { rowNumber, draft, refs, errors: [] };
  },
};

export const REPAYMENT_ENTITY: EntityDef<RepaymentDraft> = {
  key: 'repayments',
  label: 'Repayments',
  sheetName: 'Repayments',
  columns: ['Debt', 'Amount', 'Date', 'Method', 'Notes', 'Account'],
  templateRows: [['Car loan', '50000', '2026-02-01', 'manual', '', 'Bank Account']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const debtName = cell(row, 'Debt');
    const errors: string[] = [];
    if (!debtName) errors.push('Debt is required.');
    const amount = parseNumber(cell(row, 'Amount'));
    if (amount === null) errors.push('Amount must be a number.');
    const date = parseDateCell(row, 'Date');
    if (!date) errors.push('Date is required and must be a valid date.');
    const method = parseEnum(cell(row, 'Method'), REPAYMENT_METHOD_OPTIONS, 'manual');
    if (method.error) errors.push(`Method ${method.error}`);
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const accountName = optionalCell(row, 'Account');
    const draft: RepaymentDraft = {
      debtName,
      amount: amount!,
      date: date!,
      method: method.value,
      notes: cell(row, 'Notes'),
      accountName,
    };
    const refs: RefNeed[] = [{ field: 'debtId', entityKey: 'debts', name: debtName, mode: 'hardRequired' }];
    if (accountName) refs.push({ field: 'accountId', entityKey: 'accounts', name: accountName, mode: 'hardRequired' });
    return { rowNumber, draft, refs, errors: [] };
  },
};

export const TRANSACTION_ENTITY: EntityDef<TransactionDraft> = {
  key: 'transactions',
  label: 'Transactions',
  sheetName: 'Transactions',
  columns: ['Date', 'Type', 'Account', 'Category', 'Amount', 'Description'],
  templateRows: [
    ['2026-01-15', 'Expense', 'Cash Wallet', 'Groceries', '15000', 'Weekly groceries'],
    ['2026-01-20', 'Income', 'Bank Account', 'Salary', '400000', 'January salary'],
  ],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const accountName = cell(row, 'Account');
    const errors: string[] = [];
    const date = parseDateCell(row, 'Date');
    if (!date) errors.push('Date is required and must be a valid date.');
    const type = parseEnum(cell(row, 'Type'), CATEGORY_TYPE_OPTIONS, 'Expense');
    if (type.error) errors.push(`Type ${type.error}`);
    if (!accountName) errors.push('Account is required.');
    const amount = parseNumber(cell(row, 'Amount'));
    if (amount === null || amount <= 0) errors.push('Amount must be a positive number.');
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const categoryName = optionalCell(row, 'Category');
    const draft: TransactionDraft = {
      date: date!,
      type: type.value,
      accountName,
      categoryName,
      amount: amount!,
      description: cell(row, 'Description'),
    };
    const refs: RefNeed[] = [{ field: 'accountId', entityKey: 'accounts', name: accountName, mode: 'hardRequired' }];
    if (categoryName) {
      refs.push({ field: 'categoryId', entityKey: 'categories', name: categoryName, mode: 'autoCreate', onDecline: 'null' });
    }
    return { rowNumber, draft, refs, errors: [] };
  },
};

export const TRANSFER_ENTITY: EntityDef<TransferDraft> = {
  key: 'transfers',
  label: 'Transfers',
  sheetName: 'Transfers',
  columns: ['Date', 'From Account', 'To Account', 'Amount', 'Charges', 'Kind', 'Notes'],
  templateRows: [['2026-01-18', 'Bank Account', 'Cash Wallet', '20000', '0', 'Wallet to wallet', '']],
  parseRow(row, rowNumber) {
    if (isRowBlank(row, this.columns)) return { rowNumber, draft: null, refs: [], errors: [] };
    const fromAccountName = cell(row, 'From Account');
    const toAccountName = cell(row, 'To Account');
    const errors: string[] = [];
    const date = parseDateCell(row, 'Date');
    if (!date) errors.push('Date is required and must be a valid date.');
    if (!fromAccountName) errors.push('From Account is required.');
    if (!toAccountName) errors.push('To Account is required.');
    const amount = parseNumber(cell(row, 'Amount'));
    if (amount === null || amount <= 0) errors.push('Amount must be a positive number.');
    if (errors.length) return { rowNumber, draft: null, refs: [], errors };
    const draft: TransferDraft = {
      date: date!,
      fromAccountName,
      toAccountName,
      amount: amount!,
      charges: parseNumber(cell(row, 'Charges')) ?? 0,
      kind: cell(row, 'Kind') || 'Wallet to wallet',
      notes: cell(row, 'Notes'),
    };
    return {
      rowNumber,
      draft,
      refs: [
        { field: 'fromAccountId', entityKey: 'accounts', name: fromAccountName, mode: 'hardRequired' },
        { field: 'toAccountId', entityKey: 'accounts', name: toAccountName, mode: 'hardRequired' },
      ],
      errors: [],
    };
  },
};

export const ENTITY_DEFS: Record<EntityKey, EntityDef<unknown>> = {
  areas: AREA_ENTITY,
  buckets: BUCKET_ENTITY,
  accounts: ACCOUNT_ENTITY,
  categories: CATEGORY_ENTITY,
  budgets: BUDGET_ENTITY,
  projects: PROJECT_ENTITY,
  tasks: TASK_ENTITY,
  goals: GOAL_ENTITY,
  goalItems: GOAL_ITEM_ENTITY,
  debts: DEBT_ENTITY,
  repayments: REPAYMENT_ENTITY,
  transactions: TRANSACTION_ENTITY,
  transfers: TRANSFER_ENTITY,
};

export function entityDefsInOrder(): EntityDef<unknown>[] {
  return ENTITY_ORDER.map((key) => ENTITY_DEFS[key]);
}

export { isoDate, boolLabel };
