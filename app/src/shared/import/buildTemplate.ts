// The downloadable Time and Money templates (templates.ts describes them):
// a Read me sheet, the data sheets with a frozen header, sensible widths,
// a grey italic Example row, and dropdowns (data validation) on every
// column with fixed options; a hidden Lists sheet holds those options and
// the person's own names (areas, projects, wallets, baskets) so name
// columns offer real names while still taking new ones.
// exceljs is loaded only when a template is downloaded.

import type { DataValidation, Workbook, Worksheet } from 'exceljs';
import { readMe, ROW_TYPE, sheetsOf, TEMPLATE_FILE, type ColumnSpec, type NameList, type TemplateKind } from './templates';

/** Rows the dropdowns cover under the header. */
const ROWS = 1000;
const GREY = 'FF8A8A8A';
const HEADER_FILL = 'FFF1F1EF';

function columnLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export async function buildTemplate(kind: TemplateKind, names: Partial<Record<NameList, string[]>> = {}): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dreda';
  wb.created = new Date();

  // Read me
  const readme = wb.addWorksheet('Read me', { properties: { tabColor: { argb: 'FF3965FA' } } });
  readme.getColumn(1).width = 120;
  for (const line of readMe(kind)) {
    const row = readme.addRow([line.startsWith('# ') ? line.slice(2) : line]);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    if (line.startsWith('# ')) row.getCell(1).font = { bold: true, size: line.startsWith('# Dreda') ? 14 : 12 };
  }

  // Lists: one column per option list, then the person's names.
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  const listRange = new Map<string, string>();
  let listCol = 0;
  const addList = (id: string, values: readonly string[]) => {
    if (listRange.has(id) || !values.length) return;
    listCol += 1;
    const letter = columnLetter(listCol);
    lists.getCell(`${letter}1`).value = id.includes('|') ? `Options ${listCol}` : id;
    values.forEach((v, i) => (lists.getCell(`${letter}${i + 2}`).value = v));
    listRange.set(id, `Lists!$${letter}$2:$${letter}$${values.length + 1}`);
  };

  for (const sheet of sheetsOf(kind)) {
    const columns: ColumnSpec[] = [ROW_TYPE, ...sheet.columns];
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    columns.forEach((c, i) => {
      header.getCell(i + 1).note = `${c.required ? 'Required. ' : ''}${c.help}`;
    });

    const example = ws.addRow(columns.map((c) => (c.key === 'rowType' ? 'Example' : (sheet.example[c.key] ?? ''))));
    example.font = { italic: true, color: { argb: GREY } };

    columns.forEach((c, i) => {
      const letter = columnLetter(i + 1);
      if (c.format === 'date' || c.format === 'time') ws.getColumn(i + 1).numFmt = '@';
      let formula: string | null = null;
      let strict = !c.loose;
      if (c.options) {
        const id = c.options.join('|');
        addList(id, c.options);
        formula = listRange.get(id) ?? null;
      } else if (c.names && names[c.names]?.length) {
        addList(c.names, [...new Set(names[c.names])].sort((a, b) => a.localeCompare(b)));
        formula = listRange.get(c.names) ?? null;
        strict = false;
      }
      if (formula) validate(ws, letter, formula, strict, c);
    });
  }
  return wb;
}

function validate(ws: Worksheet, letter: string, formula: string, strict: boolean, c: ColumnSpec) {
  // One range per column (exceljs writes a range key as one sqref;
  // validating cell by cell makes it emit overlapping ranges).
  (ws as unknown as { dataValidations: { add: (address: string, v: DataValidation) => void } }).dataValidations.add(`${letter}2:${letter}${ROWS + 1}`, {
    type: 'list',
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: strict,
    errorStyle: strict ? 'stop' : 'information',
    errorTitle: c.header,
    error: strict ? `Choose one of the values in the list. ${c.help}` : c.help,
  });
}

/** Builds the template and saves it (dreda-time-template.xlsx or dreda-money-template.xlsx). */
export async function downloadTemplate(kind: TemplateKind, names: Partial<Record<NameList, string[]>> = {}): Promise<void> {
  const wb = await buildTemplate(kind, names);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = TEMPLATE_FILE[kind];
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
