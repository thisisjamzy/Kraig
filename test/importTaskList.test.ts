// The task import (app/src/shared/import/taskList.ts, brief 23 Nov 2026, package 7).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  cellText,
  detectOrder,
  excelSerial,
  mapColumns,
  matchesTemplate,
  parseDateCell,
  parsePriority,
  parseStatus,
  parseTime,
  planSentence,
  planTaskList,
  readAs,
  zonedDay,
  zonedInstant,
  type ExistingLists,
  type PlanOptions,
} from '../app/src/shared/import/taskList';

const today = { y: 2026, m: 11, d: 23 };

describe('dates', () => {
  test('Excel serials become yyyy-mm-dd without a time zone', () => {
    assert.equal(excelSerial(46361).date, '2026-12-05');
    assert.deepEqual(excelSerial(46361.5), { date: '2026-12-05', minutes: 720 });
  });

  test('regression: an .xlsx date cell for 5 December 2026, in Douala, previews and saves as 5 December', () => {
    // A real workbook with a real date cell, written and read back the way the import reads it.
    const ws = XLSX.utils.aoa_to_sheet([['Task', 'Due date'], ['Pay rent', new Date(2026, 11, 5)]], { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const read = XLSX.read(bytes, { type: 'array', cellDates: false });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(read.Sheets.Tasks, { raw: true, defval: '' });
    const cell = parseDateCell(rows[0]['Due date'], 'dmy', today);
    assert.equal(cell.date, '2026-12-05', 'preview');
    // Due only: the all-day convention, end of the day, in Douala.
    const due = zonedInstant(cell.date!, 23 * 60 + 59, 'Africa/Douala');
    assert.equal(zonedDay(due, 'Africa/Douala'), '2026-12-05', 'saved');
    assert.equal(due.toISOString(), '2026-12-05T22:59:00.000Z');
    const start = zonedInstant(cell.date!, 0, 'Africa/Douala');
    assert.equal(zonedDay(start, 'Africa/Douala'), '2026-12-05');
  });

  test('cellText never prints a Date through UTC', () => {
    // Local midnight, which is 23:00 the day before in UTC for UTC+1.
    assert.equal(cellText(new Date(2026, 11, 5)), '2026-12-05');
  });

  test('ISO, with or without a time', () => {
    assert.deepEqual(parseDateCell('2026-12-05', 'dmy', today), { date: '2026-12-05', minutes: null, invalid: false, disagrees: false });
    assert.equal(parseDateCell('2026-12-05T14:30', 'dmy', today).minutes, 870);
    assert.equal(parseDateCell('2026-12-05 09:15', 'dmy', today).minutes, 555);
  });

  test('numbers with slashes, dashes and dots, in the column’s order', () => {
    assert.equal(parseDateCell('05/12/2026', 'dmy', today).date, '2026-12-05');
    assert.equal(parseDateCell('05/12/2026', 'mdy', today).date, '2026-05-12');
    assert.equal(parseDateCell('5-12-26', 'dmy', today).date, '2026-12-05');
    assert.equal(parseDateCell('5.12.2026', 'dmy', today).date, '2026-12-05');
  });

  test('a date and a time in the same cell', () => {
    const c = parseDateCell('05/12/2026 14:00', 'dmy', today);
    assert.equal(c.date, '2026-12-05');
    assert.equal(c.minutes, 840);
    assert.equal(parseDateCell('5 Dec 2026 2:30 pm', 'dmy', today).minutes, 870);
  });

  test('month names in English and French', () => {
    for (const t of ['5 Dec 2026', '5 December 2026', 'December 5, 2026', 'Dec 5 2026', '5 déc. 2026', '5 décembre 2026', 'Sat 5 Dec 2026', '5th December 2026']) {
      assert.equal(parseDateCell(t, 'mdy', today).date, '2026-12-05', t);
    }
    assert.equal(parseDateCell('Mar 3, 2027', 'dmy', today).date, '2027-03-03');
    assert.equal(parseDateCell('1er mai 2027', 'dmy', today).date, '2027-05-01');
  });

  test('no year: the next time that day comes round', () => {
    assert.equal(parseDateCell('5 Dec', 'dmy', today).date, '2026-12-05');
    assert.equal(parseDateCell('05/01', 'dmy', today).date, '2027-01-05');
    assert.equal(parseDateCell('23/11', 'dmy', today).date, '2026-11-23');
  });

  test('impossible or unreadable dates are problems', () => {
    assert.equal(parseDateCell('31/02/2026', 'dmy', today).invalid, true);
    assert.equal(parseDateCell('next Friday', 'dmy', today).invalid, true);
    assert.equal(parseDateCell('', 'dmy', today).invalid, false);
  });

  test('day or month first is decided per column, from its values', () => {
    assert.equal(detectOrder(['05/12/2026', '25/12/2026']).order, 'dmy');
    assert.equal(detectOrder(['12/05/2026', '12/25/2026']).order, 'mdy');
    const both = detectOrder(['25/12/2026', '12/25/2026']);
    assert.equal(both.conflict, true);
    const ambiguous = detectOrder(['05/12/2026', '01/02/2026']);
    assert.equal(ambiguous.ambiguous, true);
    assert.equal(ambiguous.order, 'dmy');
    assert.equal(detectOrder(['05/12/2026'], 'mdy').order, 'mdy');
    assert.equal(readAs('05/12/2026', 'dmy'), '05/12/2026 is read as 5 December 2026.');
  });

  test('a value that only reads one way, in a column that reads the other, is flagged', () => {
    assert.equal(parseDateCell('25/12/2026', 'mdy', today).disagrees, true);
  });
});

describe('values', () => {
  test('times', () => {
    assert.equal(parseTime('14:30').minutes, 870);
    assert.equal(parseTime('2:30 pm').minutes, 870);
    assert.equal(parseTime('9am').minutes, 540);
    assert.equal(parseTime('9h30').minutes, 570);
    assert.equal(parseTime('9h').minutes, 540);
    assert.equal(parseTime(0.5).minutes, 720);
    assert.equal(parseTime('25:00').invalid, true);
  });

  test('priority and status, English and French', () => {
    assert.deepEqual(parsePriority('Do first'), { priority: 'High', quadrant: 'do', invalid: false });
    assert.equal(parsePriority('Basse').priority, 'Low');
    assert.equal(parsePriority('soon').invalid, true);
    assert.equal(parseStatus('En cours').status, 'Pending');
    assert.equal(parseStatus('Terminé').status, 'Done');
    assert.equal(parseStatus('In review').status, 'In Review');
  });
});

describe('columns', () => {
  test('exact names only, English or French; no prefix or suffix guessing', () => {
    const map = mapColumns(['Area', 'Dossier', 'Projet', 'Tâche', 'Due date', 'Due to', 'From area']);
    assert.equal(map['Area'], 'area');
    assert.equal(map['Dossier'], 'folder');
    assert.equal(map['Tâche'], 'task');
    assert.equal(map['Due date'], 'due');
    assert.equal(map['Due to'], 'ignore');
    assert.equal(map['From area'], 'ignore');
  });

  test('the template’s headers skip the columns step', () => {
    assert.equal(matchesTemplate(['Area', 'Folder', 'Project', 'Task', 'Due date', 'Start time', 'End time', 'Priority', 'Status', 'Repeats', 'Notes', 'Subtasks', 'Tags']), true);
    assert.equal(matchesTemplate(['Area', 'Task', 'When']), false);
  });

  test('a remembered choice wins', () => {
    assert.equal(mapColumns(['When'], { when: 'due' })['When'], 'due');
  });
});

describe('the plan', () => {
  const existing: ExistingLists = {
    areas: [{ id: 'work', name: 'Work' }],
    folders: [
      { id: 'work-general', name: 'General', areaId: 'work', isDefault: true },
      { id: 'admin', name: 'Admin', areaId: 'work', isDefault: false },
    ],
    projects: [{ id: 'budget', name: 'Budget 2026', areaId: 'work', bucketId: 'admin' }],
    tasks: [{ projectId: 'budget', title: 'send figures', due: '2026-12-05' }],
  };
  const base = (over: Partial<PlanOptions> = {}): PlanOptions => ({
    mapping: { Area: 'area', Folder: 'folder', Project: 'project', Task: 'task', 'Due date': 'due' },
    orders: { 'Due date': 'dmy' },
    today,
    nameChoices: {},
    includeDuplicates: new Set(),
    edits: {},
    ...over,
  });

  test('new areas, folders and projects are created above the tasks; names only match within their parent', () => {
    const rows = [
      { Area: 'Home', Folder: 'Admin', Project: 'Papers', Task: 'Renew ID', 'Due date': '05/12/2026' },
      { Area: 'Work', Folder: 'Admin', Project: 'Budget 2026', Task: 'Draft', 'Due date': '' },
      { Area: '', Folder: '', Project: '', Task: 'Call mum', 'Due date': '' },
    ];
    const plan = planTaskList(rows, existing, base());
    assert.equal(plan.counts.newAreas, 1);
    // Home's Admin is new; Work's Admin exists.
    assert.equal(plan.counts.newFolders, 1);
    assert.equal(plan.counts.newProjects, 1);
    assert.equal(plan.counts.inbox, 1);
    const draft = plan.tasks.find((t) => t.title === 'Draft')!;
    assert.equal(plan.projects.find((p) => p.key === draft.projectKey)!.existingId, 'budget');
  });

  test('a folder with no project goes to a project named after the folder; area only to General tasks', () => {
    const plan = planTaskList(
      [
        { Area: 'Home', Folder: 'Garden', Project: '', Task: 'Mow', 'Due date': '' },
        { Area: 'Home', Folder: '', Project: '', Task: 'Tidy', 'Due date': '' },
      ],
      existing,
      base()
    );
    assert.deepEqual(plan.projects.map((p) => p.name).sort(), ['Garden', 'General tasks']);
  });

  test('a folder or project with no area is a problem on that row', () => {
    const plan = planTaskList([{ Area: '', Folder: 'Admin', Project: '', Task: 'X', 'Due date': '' }], existing, base());
    assert.deepEqual(plan.tasks[0].problems, ['Which area is this in?']);
    assert.equal(plan.tasks[0].include, false);
  });

  test('a near name asks "Did you mean"; the answer applies to every row with that name', () => {
    const rows = [
      { Area: 'Work', Folder: 'Admin', Project: 'Budget 2027', Task: 'A', 'Due date': '' },
      { Area: 'Work', Folder: 'Admin', Project: 'Budget 2027', Task: 'B', 'Due date': '' },
    ];
    const asked = planTaskList(rows, existing, base());
    assert.equal(asked.questions.length, 1);
    assert.equal(asked.ready, false);
    const answered = planTaskList(rows, existing, base({ nameChoices: { [asked.questions[0].key]: 'existing' } }));
    assert.equal(answered.ready, true);
    assert.equal(answered.counts.newProjects, 0);
    const created = planTaskList(rows, existing, base({ nameChoices: { [asked.questions[0].key]: 'new' } }));
    assert.equal(created.counts.newProjects, 1);
  });

  test('duplicates, in Dreda or in the file, are left out unless switched back on', () => {
    const rows = [
      { Area: 'Work', Folder: 'Admin', Project: 'Budget 2026', Task: 'Send figures', 'Due date': '5 Dec 2026' },
      { Area: 'Work', Folder: 'Admin', Project: 'Budget 2026', Task: 'Plan', 'Due date': '' },
      { Area: 'Work', Folder: 'Admin', Project: 'Budget 2026', Task: 'plan!', 'Due date': '' },
    ];
    const plan = planTaskList(rows, existing, base());
    assert.deepEqual(plan.tasks.map((t) => t.duplicate), ['existing', null, 'file']);
    assert.equal(plan.counts.tasks, 1);
    const back = planTaskList(rows, existing, base({ includeDuplicates: new Set([0]) }));
    assert.equal(back.counts.tasks, 2);
  });

  test('a cell fixed in the check step is read again', () => {
    const rows = [{ Area: 'Home', Folder: '', Project: '', Task: 'X', 'Due date': 'someday' }];
    assert.equal(planTaskList(rows, existing, base()).counts.problems, 1);
    assert.equal(planTaskList(rows, existing, base({ edits: { 0: { due: '6/12/2026' } } })).tasks[0].due, '2026-12-06');
  });

  test('opened from an area, blank rows go there', () => {
    const plan = planTaskList([{ Area: '', Folder: '', Project: '', Task: 'X', 'Due date': '' }], existing, base({ context: { area: { id: 'work', name: 'Work' } } }));
    assert.equal(plan.tasks[0].fromContext, true);
    assert.equal(plan.counts.inbox, 0);
    assert.equal(plan.counts.newAreas, 0);
  });

  test('the summary sentence', () => {
    const plan = planTaskList(
      [
        { Area: 'Home', Folder: 'Admin', Project: 'Papers', Task: 'A', 'Due date': '' },
        { Area: 'Home', Folder: 'Admin', Project: 'Papers', Task: 'B', 'Due date': 'nope' },
      ],
      existing,
      base()
    );
    assert.equal(planSentence(plan), 'This will add 1 area, 1 folder, 1 project and 1 task. 1 row needs a look.');
  });
});

describe('the template', () => {
  test('a Tasks sheet with the headers, dropdowns, and the two other sheets; it reads back as the template', async () => {
    const { buildTaskListTemplate } = await import('../app/src/logic/importData/taskListTemplate');
    const bytes = buildTaskListTemplate({
      areas: [{ id: 'w', name: 'Work' }],
      folders: [{ id: 'f', name: 'Admin', areaId: 'w', isDefault: false }],
      projects: [{ name: 'Budget', areaId: 'w', bucketId: 'f' }],
    });
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: true });
    assert.deepEqual(wb.SheetNames, ['Tasks', 'How to fill this in', 'Your lists']);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Tasks, { header: 1, raw: true, defval: '' });
    assert.equal(matchesTemplate(matrix[0].map(String)), true);
    assert.equal(matrix.length, 4);
    // Dates are text, read day first.
    assert.equal(typeof matrix[1][4], 'string');
    const cfb = XLSX.CFB.read(bytes, { type: 'array' });
    const xml = new TextDecoder().decode(cfb.FileIndex[cfb.FullPaths.findIndex((p) => p.endsWith('xl/worksheets/sheet1.xml'))].content as Uint8Array);
    assert.match(xml, /<dataValidations count="2">/);
    assert.match(xml, /High,Medium,Low,Do first/);
  });
});

describe('the 30-task file (brief, order of work 7)', () => {
  test('two new areas, three new folders, a near-duplicate project; every task sits under its own project', () => {
    const existing: ExistingLists = {
      areas: [{ id: 'work', name: 'Work' }],
      folders: [
        { id: 'work-general', name: 'General', areaId: 'work', isDefault: true },
        { id: 'admin', name: 'Admin', areaId: 'work', isDefault: false },
      ],
      projects: [{ id: 'q4', name: 'Quarterly report', areaId: 'work', bucketId: 'admin' }],
      tasks: [],
    };
    const places = [
      ['Home', 'Garden', 'Spring beds'],
      ['Home', 'Repairs', 'Roof'],
      ['Health', 'Fitness', 'Run 10k'],
      ['Health', '', ''],
      ['Work', 'Admin', 'Quarterly reports'], // near "Quarterly report"
      ['Work', 'Admin', 'Quarterly report'],
    ];
    const rows = Array.from({ length: 30 }, (_, i) => {
      const [Area, Folder, Project] = places[i % places.length];
      return { Area, Folder, Project, Task: `Task ${i + 1}`, 'Due date': `${(i % 28) + 1}/12/2026` };
    });
    const opts = {
      mapping: { Area: 'area', Folder: 'folder', Project: 'project', Task: 'task', 'Due date': 'due' } as const,
      orders: { 'Due date': 'dmy' as const },
      today,
      nameChoices: {} as Record<string, 'existing' | 'new'>,
      includeDuplicates: new Set<number>(),
      edits: {},
    };
    const asked = planTaskList(rows, existing, { ...opts, mapping: { ...opts.mapping } });
    assert.equal(asked.questions.length, 1);
    assert.equal(asked.questions[0].existing.name, 'Quarterly report');
    const plan = planTaskList(rows, existing, { ...opts, mapping: { ...opts.mapping }, nameChoices: { [asked.questions[0].key]: 'existing' } });
    assert.equal(plan.counts.newAreas, 2);
    assert.equal(plan.counts.newFolders, 3);
    assert.equal(plan.counts.tasks, 30);
    // Spring beds, Roof, Run 10k, and General tasks for Health.
    assert.equal(plan.counts.newProjects, 4);
    // Every task's project hangs under its folder, and that folder under the task's area.
    for (const t of plan.tasks) {
      const project = plan.projects.find((p) => p.key === t.projectKey)!;
      const folder = plan.folders.find((f) => f.key === project.parentKey)!;
      assert.equal(folder.key, t.folderKey);
      assert.equal(folder.parentKey, t.areaKey);
    }
  });
});
