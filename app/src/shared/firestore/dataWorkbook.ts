'use client';

// Builds/reads the actual .xlsx workbooks for Settings > Data (export,
// template download, import) — the only file in this feature that touches
// the `xlsx` (SheetJS) library. Column shape/ordering comes from
// dataEntities.ts; this module just turns that plus live Firestore docs
// into worksheets, or a worksheet back into raw row objects.

import * as XLSX from 'xlsx';
import { ENTITY_DEFS, isoDate, boolLabel, type EntityKey } from './dataEntities';
import type {
  FirestoreArea,
  FirestoreBucket,
  FirestoreAccount,
  FirestoreCategory,
  FirestoreBudgetRule,
  FirestoreProject,
  FirestoreTask,
  FirestoreGoal,
  FirestoreGoalLineItem,
  FirestoreDebt,
  FirestoreRepayment,
  FirestoreTransaction,
  FirestoreTransfer,
} from './types';

// Name lookups every toRow function below can draw on — built once per
// export from whichever collections were actually fetched (see
// src/logic/exportData/useLogic.ts), regardless of which sheets the user
// actually checked, so a Transaction row's Account/Category names always
// resolve even if those entities' own sheets weren't requested.
export interface ExportLookups {
  areaName: Map<string, string>;
  bucketName: Map<string, string>;
  accountName: Map<string, string>;
  categoryName: Map<string, string>;
  projectName: Map<string, string>;
  goalName: Map<string, string>;
  debtName: Map<string, string>;
}

function name(map: Map<string, string>, id: string | null | undefined): string {
  if (!id) return '';
  return map.get(id) ?? id;
}

export interface ExportData {
  areas: FirestoreArea[];
  buckets: FirestoreBucket[];
  accounts: FirestoreAccount[];
  categories: FirestoreCategory[];
  budgets: FirestoreBudgetRule[];
  projects: FirestoreProject[];
  tasks: FirestoreTask[];
  goals: FirestoreGoal[];
  goalItems: FirestoreGoalLineItem[];
  debts: FirestoreDebt[];
  repayments: FirestoreRepayment[];
  transactions: FirestoreTransaction[];
  transfers: FirestoreTransfer[];
}

function timestampToDateStr(ts: { toDate: () => Date } | null | undefined): string {
  return ts ? isoDate(ts.toDate()) : '';
}

function rowsFor(key: EntityKey, data: ExportData, lookups: ExportLookups): string[][] {
  switch (key) {
    case 'areas':
      return data.areas.map((a) => [a.name, a.emoji ?? '', a.color, a.description, boolLabel(a.archived)]);
    case 'buckets':
      // The auto-generated default bucket (id `default-{areaId}`) isn't
      // real user data — every area gets one automatically on import too.
      return data.buckets
        .filter((b) => !b.isDefault)
        .map((b) => [b.name, name(lookups.areaName, b.areaId), b.emoji ?? '', b.color, b.description, boolLabel(b.archived)]);
    case 'accounts':
      // Never export the system Unjustified wallet — it isn't real
      // household data, and re-importing it would try to create a second one.
      return data.accounts
        .filter((a) => !a.isSystemWallet)
        .map((a) => [
          a.name,
          a.type,
          a.currency,
          String(a.startingBalance),
          a.notes,
          boolLabel(a.archived),
          boolLabel(a.notSpendable),
          boolLabel(a.frozen),
        ]);
    case 'categories':
      return data.categories.map((c) => [c.name, c.transactionType, c.group ?? '', c.notes ?? '', boolLabel(c.archived)]);
    case 'budgets':
      return data.budgets.map((b) => [
        name(lookups.categoryName, b.categoryId),
        b.description,
        String(b.budgetedAmount),
        b.frequency,
        name(lookups.accountName, b.accountId),
        b.tag ?? '',
        boolLabel(b.archived),
      ]);
    case 'projects':
      return data.projects.map((p) => [
        p.name,
        name(lookups.areaName, p.areaId),
        name(lookups.bucketName, p.bucketId),
        p.color,
        p.priority,
        timestampToDateStr(p.startDate),
        timestampToDateStr(p.endDate),
        p.status,
        p.description,
      ]);
    case 'tasks':
      return data.tasks.map((t) => [
        t.title,
        name(lookups.projectName, t.projectId),
        t.type,
        t.priority,
        t.status ?? (t.done ? 'Done' : 'Pending'),
        timestampToDateStr(t.startTime),
        timestampToDateStr(t.dueDate),
        t.notes,
        (t.tags ?? []).join(', '),
      ]);
    case 'goals':
      return data.goals.map((g) => [g.name, g.description, g.currency, timestampToDateStr(g.deadline), boolLabel(g.archived)]);
    case 'goalItems':
      return data.goalItems.map((i) => [
        name(lookups.goalName, i.goalId),
        i.name,
        i.description,
        String(i.amount),
        i.priority,
        i.necessity,
        boolLabel(i.completed),
      ]);
    case 'debts':
      return data.debts.map((d) => [
        d.name,
        d.description,
        d.debtType,
        name(lookups.accountName, d.accountId),
        String(d.principalAmount),
        d.currency,
        d.priority,
        timestampToDateStr(d.startDate),
        d.notes,
      ]);
    case 'repayments':
      return data.repayments.map((r) => [
        name(lookups.debtName, r.debtId),
        String(r.amount),
        timestampToDateStr(r.date),
        r.method,
        r.notes,
        '',
      ]);
    case 'transactions':
      return data.transactions.map((t) => [
        timestampToDateStr(t.date),
        t.type,
        name(lookups.accountName, t.accountId),
        name(lookups.categoryName, t.categoryId),
        String(t.amount),
        t.description,
      ]);
    case 'transfers':
      return data.transfers.map((t) => [
        timestampToDateStr(t.date),
        name(lookups.accountName, t.fromAccountId),
        name(lookups.accountName, t.toAccountId),
        String(t.amount),
        String(t.charges ?? 0),
        t.kind,
        t.notes,
      ]);
    default:
      return [];
  }
}

function sheetFromRows(columns: string[], rows: string[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([columns, ...rows]);
}

/** Builds a workbook of real data — one sheet per selected entity key. */
export function buildExportWorkbook(selectedKeys: EntityKey[], data: ExportData, lookups: ExportLookups): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const key of selectedKeys) {
    const def = ENTITY_DEFS[key];
    const sheet = sheetFromRows(def.columns, rowsFor(key, data, lookups));
    XLSX.utils.book_append_sheet(workbook, sheet, def.sheetName);
  }
  return workbook;
}

/** Builds a blank template workbook — header row plus example rows, one sheet per selected entity key. */
export function buildTemplateWorkbook(selectedKeys: EntityKey[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const key of selectedKeys) {
    const def = ENTITY_DEFS[key];
    const sheet = sheetFromRows(def.columns, def.templateRows);
    XLSX.utils.book_append_sheet(workbook, sheet, def.sheetName);
  }
  return workbook;
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(workbook, filename);
}

export interface ParsedSheet {
  entityKey: EntityKey;
  sheetName: string;
  rows: Record<string, unknown>[];
}

export interface ReadWorkbookResult {
  sheets: ParsedSheet[];
  unrecognizedSheetNames: string[];
}

const SHEET_NAME_TO_KEY: Map<string, EntityKey> = new Map(
  Object.values(ENTITY_DEFS).map((def) => [def.sheetName.toLowerCase(), def.key])
);

/**
 * Reads an uploaded .xlsx or .csv file (SheetJS auto-detects the format
 * from the buffer) and returns each sheet's raw rows keyed by column
 * header, matched against dataEntities.ts's known sheet names. A .csv
 * upload only ever has one sheet — if its name doesn't match, but its own
 * header row exactly matches the Transactions column set, it's treated as
 * a Transactions sheet (the common case: someone re-uploading the old
 * single-entity template shape).
 */
export async function readWorkbookFile(file: File): Promise<ReadWorkbookResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  const sheets: ParsedSheet[] = [];
  const unrecognizedSheetNames: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    let entityKey = SHEET_NAME_TO_KEY.get(sheetName.trim().toLowerCase());

    if (!entityKey && workbook.SheetNames.length === 1) {
      const headerRow = rows[0] ? Object.keys(rows[0]) : [];
      const transactionColumns = ENTITY_DEFS.transactions.columns;
      const looksLikeTransactions = transactionColumns.every((c) => headerRow.includes(c));
      if (looksLikeTransactions) entityKey = 'transactions';
    }

    if (!entityKey) {
      unrecognizedSheetNames.push(sheetName);
      continue;
    }
    sheets.push({ entityKey, sheetName, rows });
  }

  return { sheets, unrecognizedSheetNames };
}
