// "Task list template" (owner, 23 Nov 2026): the one file to fill in for
// the task import, as .xlsx (or .csv). Three sheets:
//   - Tasks: the twelve columns, dropdowns on Priority and Status, the date
//     column as text dd/mm/yyyy, and three example rows (a new area, folder
//     and project; an area you have; a new area's General folder). Area,
//     Folder and Project are required on every row (owner, 24 Nov 2026);
//   - How to fill this in: each column and what it accepts;
//   - Your lists: your areas, folders and projects, to copy names exactly.

import * as XLSX from 'xlsx';
import { TASK_LIST_FIELDS, TEMPLATE_HEADERS } from '@/src/shared/import/taskList';

export interface YourLists {
  areas: { id: string; name: string }[];
  folders: { id: string; name: string; areaId: string; isDefault: boolean }[];
  projects: { name: string; areaId: string | null; bucketId: string | null }[];
}

const PRIORITIES = ['High', 'Medium', 'Low', 'Do first', 'Schedule', 'Delegate', 'Eliminate'];
const STATUSES = ['To do', 'Doing', 'Stuck', 'In review', 'Done', 'Cancelled'];
const LAST_ROW = 2001;

const pad = (n: number) => String(n).padStart(2, '0');
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Three example rows: a new area, a folder you already have (or one like it), and a new area's General folder. */
function examples(lists: YourLists): string[][] {
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const later = new Date();
  later.setDate(later.getDate() + 14);
  const area = lists.areas[0];
  const folder = area ? lists.folders.find((f) => f.areaId === area.id && !f.isDefault) : undefined;
  const row = (values: Partial<Record<string, string>>) => TEMPLATE_HEADERS.map((h) => values[h] ?? '');
  return [
    row({ Area: 'Home', Folder: 'Admin', Project: 'Papers', Task: 'Renew passport', 'Due date': ddmmyyyy(soon), Priority: 'High', Status: 'To do', Notes: 'A new area, folder and project: all created for you.', Subtasks: 'Photos; Form; Appointment', Tags: 'errand' }),
    row({
      Area: area?.name ?? 'Work',
      Folder: folder?.name ?? 'Admin',
      Project: 'Planning',
      Task: 'Weekly review',
      'Due date': ddmmyyyy(later),
      'Start time': '09:00',
      'End time': '09:30',
      Priority: 'Schedule',
      Status: 'To do',
      Repeats: 'weekly on Friday',
      Notes: area ? 'An area you already have. A project that is new is created in this folder.' : 'Area, Folder and Project are needed on every row.',
    }),
    row({ Area: 'Home', Folder: 'General', Project: 'Repairs', Task: 'Call the plumber', Notes: 'A new area comes with a folder called General.' }),
  ];
}

function tasksSheet(lists: YourLists): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...examples(lists)]);
  const dueCol = TEMPLATE_HEADERS.indexOf('Due date');
  // The date column is text, so Excel keeps 05/12/2026 as typed.
  for (let r = 1; r <= 3; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: dueCol })];
    if (cell) {
      cell.t = 's';
      cell.z = '@';
    }
  }
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: h === 'Task' || h === 'Notes' ? 32 : h === 'Subtasks' ? 26 : 14 }));
  return ws;
}

function howSheet(): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Column', 'What it accepts'],
    ...TASK_LIST_FIELDS.map((f) => [f.label, f.accepts]),
    [],
    ['One task per row.', 'Area, Folder, Project and Task are needed on every row; a row missing one is shown to fix before it can be imported. Anything new is created with the first task that names it. Names are matched without caring about capitals, accents or punctuation.'],
    ['Dates', 'Day first unless the column shows otherwise (a date like 25/12 can only be day first). A date with no year is the next time that day comes round.'],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 100 }];
  return ws;
}

function listsSheet(lists: YourLists): XLSX.WorkSheet {
  const areaName = new Map(lists.areas.map((a) => [a.id, a.name]));
  const folderName = new Map(lists.folders.map((f) => [f.id, f.name]));
  const defaultFolder = new Map(lists.folders.filter((f) => f.isDefault).map((f) => [f.areaId, f.name]));
  const rows: string[][] = [['Area', 'Folder', 'Project']];
  for (const a of [...lists.areas].sort((x, y) => x.name.localeCompare(y.name))) {
    rows.push([a.name, '', '']);
    for (const f of lists.folders.filter((x) => x.areaId === a.id).sort((x, y) => Number(y.isDefault) - Number(x.isDefault) || x.name.localeCompare(y.name))) {
      rows.push([a.name, f.isDefault ? '' : f.name, '']);
    }
  }
  for (const p of [...lists.projects].sort((x, y) => x.name.localeCompare(y.name))) {
    const area = p.areaId ? (areaName.get(p.areaId) ?? '') : '';
    const folder = p.bucketId ? (folderName.get(p.bucketId) ?? '') : '';
    rows.push([area, folder === (p.areaId ? defaultFolder.get(p.areaId) : undefined) ? '' : folder, p.name]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 32 }];
  return ws;
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dropdowns on Priority and Status, written into the Tasks sheet's XML (SheetJS doesn't write them itself). */
function withDropdowns(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  const col = (h: string) => XLSX.utils.encode_col(TEMPLATE_HEADERS.indexOf(h));
  const list = (values: string[], h: string) =>
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${h}" error="Choose from the list." sqref="${col(h)}2:${col(h)}${LAST_ROW}"><formula1>"${xmlEscape(values.join(','))}"</formula1></dataValidation>`;
  const cfb = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const at = cfb.FullPaths.findIndex((p: string) => p.endsWith('xl/worksheets/sheet1.xml'));
  if (at < 0) return new Uint8Array(bytes);
  const entry = cfb.FileIndex[at];
  const xml = new TextDecoder().decode(entry.content as Uint8Array);
  const next = xml.replace('</sheetData>', `</sheetData><dataValidations count="2">${list(PRIORITIES, 'Priority')}${list(STATUSES, 'Status')}</dataValidations>`);
  const content = new TextEncoder().encode(next);
  entry.content = content as never;
  entry.size = content.length;
  return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }) as Uint8Array;
}

function save(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The template as an .xlsx file, the Tasks sheet first. */
export function buildTaskListTemplate(lists: YourLists): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, tasksSheet(lists), 'Tasks');
  XLSX.utils.book_append_sheet(wb, howSheet(), 'How to fill this in');
  XLSX.utils.book_append_sheet(wb, listsSheet(lists), 'Your lists');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return withDropdowns(bytes);
}

export function downloadTaskListTemplate(lists: YourLists, format: 'xlsx' | 'csv' = 'xlsx') {
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(tasksSheet(lists));
    save(`﻿${csv}`, 'dreda-task-list.csv', 'text/csv;charset=utf-8');
    return;
  }
  save(buildTaskListTemplate(lists) as BlobPart, 'dreda-task-list.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
