// Minimal CSV encode/decode for the Settings screen's transaction
// import/export round trip — no external dependency (this repo has none),
// good enough for this app's own template shape, not a general-purpose CSV
// library. RFC4180-ish: quotes a field containing a comma/quote/newline,
// doubles embedded quotes; the parser is the exact inverse.

export function encodeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvRow(fields: string[]): string {
  return fields.map(encodeCsvField).join(',');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank trailing/blank lines a spreadsheet export often adds.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// ---------------------------------------------------------------------------------
// Transaction import/export — the one CSV shape this app actually uses.
// ---------------------------------------------------------------------------------

export const TRANSACTION_CSV_HEADERS = ['Date', 'Type', 'Account', 'Category', 'Amount', 'Description'] as const;

export type TransactionCsvType = 'Expense' | 'Income' | 'Savings';

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function buildTransactionCsvTemplate(): string {
  const lines = [
    toCsvRow([...TRANSACTION_CSV_HEADERS]),
    toCsvRow(['2026-01-15', 'Expense', 'Cash Wallet', 'Groceries', '15000', 'Weekly groceries']),
    toCsvRow(['2026-01-20', 'Income', 'Bank Account', 'Salary', '400000', 'January salary']),
    toCsvRow(['2026-01-25', 'Savings', 'Bank Account', 'Emergency Fund', '50000', '']),
  ];
  return lines.join('\r\n');
}

export interface ExportableTransaction {
  date: Date;
  type: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  description: string;
}

export function buildTransactionsCsv(
  transactions: ExportableTransaction[],
  accountName: Map<string, string>,
  categoryName: Map<string, string>
): string {
  const lines = [toCsvRow([...TRANSACTION_CSV_HEADERS])];
  for (const t of transactions) {
    lines.push(
      toCsvRow([
        isoDate(t.date),
        t.type,
        accountName.get(t.accountId) ?? t.accountId,
        t.categoryId ? categoryName.get(t.categoryId) ?? t.categoryId : '',
        String(t.amount),
        t.description,
      ])
    );
  }
  return lines.join('\r\n');
}

export interface ParsedTransactionCsvRow {
  rowNumber: number;
  date: Date;
  type: TransactionCsvType;
  accountId: string;
  categoryId: string | null;
  amount: number;
  description: string;
}

export interface CsvImportError {
  rowNumber: number;
  message: string;
}

export interface CsvImportResult {
  rows: ParsedTransactionCsvRow[];
  errors: CsvImportError[];
}

export function parseTransactionsCsv(
  text: string,
  accountsByName: Map<string, { id: string }>,
  categoriesByName: Map<string, { id: string }>
): CsvImportResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: [{ rowNumber: 0, message: 'The file is empty.' }] };
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = {
    date: header.indexOf('date'),
    type: header.indexOf('type'),
    account: header.indexOf('account'),
    category: header.indexOf('category'),
    amount: header.indexOf('amount'),
    description: header.indexOf('description'),
  };
  if (idx.date === -1 || idx.type === -1 || idx.account === -1 || idx.amount === -1) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 0,
          message: 'Missing required columns — expected Date, Type, Account, Category, Amount, Description.',
        },
      ],
    };
  }

  const rows: ParsedTransactionCsvRow[] = [];
  const errors: CsvImportError[] = [];

  for (let i = 1; i < table.length; i++) {
    const cols = table[i];
    const rowNumber = i + 1; // 1-based, matches the row a spreadsheet would show (header is row 1)
    const dateStr = (cols[idx.date] ?? '').trim();
    const typeStr = (cols[idx.type] ?? '').trim();
    const accountStr = (cols[idx.account] ?? '').trim();
    const categoryStr = idx.category >= 0 ? (cols[idx.category] ?? '').trim() : '';
    const amountStr = (cols[idx.amount] ?? '').trim();
    const description = idx.description >= 0 ? (cols[idx.description] ?? '').trim() : '';

    if (!dateStr && !typeStr && !accountStr && !amountStr) continue; // blank row

    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      errors.push({ rowNumber, message: `Invalid date "${dateStr}" — use YYYY-MM-DD.` });
      continue;
    }
    if (typeStr !== 'Expense' && typeStr !== 'Income' && typeStr !== 'Savings') {
      errors.push({ rowNumber, message: `Type must be Expense, Income, or Savings — got "${typeStr}".` });
      continue;
    }
    const account = accountsByName.get(accountStr.toLowerCase());
    if (!account) {
      errors.push({ rowNumber, message: `No wallet named "${accountStr}".` });
      continue;
    }
    let categoryId: string | null = null;
    if (categoryStr) {
      const category = categoriesByName.get(categoryStr.toLowerCase());
      if (!category) {
        errors.push({ rowNumber, message: `No category named "${categoryStr}".` });
        continue;
      }
      categoryId = category.id;
    }
    const amount = Number(amountStr.replace(/[^0-9.-]/g, ''));
    if (!(amount > 0)) {
      errors.push({ rowNumber, message: `Amount must be a positive number — got "${amountStr}".` });
      continue;
    }
    rows.push({ rowNumber, date, type: typeStr, accountId: account.id, categoryId, amount, description });
  }

  return { rows, errors };
}

/** Triggers a browser download of `content` as a file named `filename` — a plain Blob + object URL, no server round trip. */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
