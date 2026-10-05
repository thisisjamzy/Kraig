// The Time and Money spreadsheet templates: name matching, repeat columns,
// template detection, column matching, the review (linking, duplicates,
// updates) and the generated files (src/shared/import).
import test from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, sameName } from '../app/src/shared/import/names';
import { parseRepeatCells } from '../app/src/shared/import/recurrenceColumns';
import { detectTemplate, mapColumns, specFor, TIME_SHEETS, MONEY_SHEETS } from '../app/src/shared/import/templates';
import { buildTimeReview, type TaskValues, type TimeExisting, type SheetRows } from '../app/src/shared/import/timeReview';
import { buildMoneyReview, type MoneyExisting, type BasketItemValues } from '../app/src/shared/import/moneyReview';
import { impliedText, summarize, summaryText } from '../app/src/shared/import/review';
import { buildTemplate } from '../app/src/shared/import/buildTemplate';

// ---- Names ----

test('names match after trimming, collapsing spaces and ignoring capitals; nothing fuzzy', () => {
  assert.equal(nameKey('  Learning   French '), 'learning french');
  assert.ok(sameName('learning  French', 'Learning French'));
  assert.ok(!sameName('Learning French', 'Learning Frenchh'));
  assert.ok(!sameName('', ''));
});

// ---- Repeats ----

test('weekly on Tue and Thu, 20 times', () => {
  const r = parseRepeatCells({ repeats: 'Weekly', every: 1, onDays: 'Tue, Thu', ends: 'After', occurrences: 20 }, '2026-10-06');
  assert.deepEqual(r.problems, []);
  assert.equal(r.rrule, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH;COUNT=20');
  assert.equal(r.text, 'Every week on Tue and Thu, 20 times');
});

test('monthly on the last Friday; daily; weekdays; every 2 weeks defaults to the weekday of Date', () => {
  const last = parseRepeatCells({ repeats: 'Monthly', monthlyBy: 'Weekday of month', weekOfMonth: 'Last', onDays: 'Fri' }, '2026-10-30');
  assert.equal(last.rule?.byNthDay?.n, -1);
  assert.equal(last.rule?.byNthDay?.day, 'FR');
  assert.equal(last.text, 'Every month on the last Friday');
  assert.equal(parseRepeatCells({ repeats: 'Daily' }, '2026-10-05').rrule, 'FREQ=DAILY;INTERVAL=1');
  assert.equal(parseRepeatCells({ repeats: 'Weekdays' }, '2026-10-05').text, 'Every weekday');
  assert.deepEqual(parseRepeatCells({ repeats: 'Weekly', every: 2 }, '2026-10-06').rule?.byDay, ['TU']);
});

test('an RRULE overrides the friendly columns', () => {
  const r = parseRepeatCells({ repeats: 'Daily', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=20' }, '2026-10-06');
  assert.equal(r.rule?.freq, 'WEEKLY');
  assert.equal(r.rule?.count, 20);
});

test('impossible repeats are plain problems', () => {
  assert.match(parseRepeatCells({ repeats: 'Weekly', ends: 'On date' }, '2026-10-06').problems[0], /End date is empty/);
  assert.match(parseRepeatCells({ repeats: 'Weekly', onDays: 'Tue, Funday' }, '2026-10-06').problems[0], /"funday" is not a day/);
  assert.match(parseRepeatCells({ repeats: 'Fortnightly' }, '2026-10-06').problems[0], /Repeats must be/);
  assert.match(parseRepeatCells({ repeats: 'Weekly' }, null).problems[0], /needs a Date/);
  assert.deepEqual(parseRepeatCells({ repeats: '' }, null), { rule: null, rrule: null, skip: [], problems: [], text: '' });
});

// ---- Detection and columns ----

test('a file is detected as Time or Money from its sheets and headers; the old template is recognised', () => {
  assert.equal(detectTemplate([{ name: 'Wallets', headers: ['Name'] }, { name: 'Basket items', headers: ['Basket', 'Name', 'Amount'] }]).kind, 'money');
  assert.equal(detectTemplate([{ name: 'Tasks', headers: ['Name', 'Project', 'Time mode'] }]).kind, 'time');
  const old = detectTemplate([{ name: 'Areas', headers: ['Name'] }, { name: 'Tasks', headers: ['Title', 'Project', 'Type', 'Priority', 'Status', 'Start Time', 'Due Date', 'Notes', 'Tags'] }]);
  assert.deepEqual(old, { kind: 'time', old: true });
  assert.equal(detectTemplate([{ name: 'Sheet1', headers: ['Foo'] }]).kind, null);
});

test('old template columns map to their new places', () => {
  const spec = specFor('time', 'tasks')!;
  const m = mapColumns(spec, ['Title', 'Project', 'Priority', 'Start Time', 'Due Date', 'Notes', 'Whatever']);
  assert.equal(m['Title'], 'name');
  assert.equal(m['Notes'], 'description');
  assert.equal(m['Priority'], 'priority');
  assert.equal(m['Start Time'], 'legacyStart');
  assert.equal(m['Due Date'], 'legacyDue');
  assert.equal(m['Whatever'], 'ignore');
  // A remembered choice wins.
  assert.equal(mapColumns(spec, ['Whatever'], { whatever: 'tags' })['Whatever'], 'tags');
});

// ---- Time review ----

const headersOf = (rows: Record<string, unknown>[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
const none: TimeExisting = { areas: [], sections: [], projects: [], tasks: [] };
function sheet(name: string, rows: Record<string, unknown>[]): SheetRows {
  const spec = specFor('time', name)!;
  return { sheet: name, rows, mapping: mapColumns(spec, headersOf(rows)) };
}
const task = (items: ReturnType<typeof buildTimeReview>, name: string) => items.find((i) => i.kind === 'task' && i.name === name)!;

test('a weekly blocked study session is one recurring task, 20 times, pushed to Google', () => {
  const items = buildTimeReview({
    tasks: sheet('Tasks', [
      { 'Row type': 'Example', Name: 'Ignored' },
      { Name: 'Study session', Date: '06/10/2026', 'Start time': '06:00', 'End time': '07:00', Repeats: 'Weekly', 'On days': 'Tue, Thu', Ends: 'After', Occurrences: 20, 'Time mode': 'Blocked' },
    ]),
    existing: none,
  });
  assert.equal(items.length, 1);
  const t = items[0];
  const v = t.values as TaskValues;
  assert.equal(t.status, 'new');
  assert.equal(v.rrule, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH;COUNT=20');
  assert.equal(v.timeMode, 'blocked');
  assert.equal(v.push, true);
  assert.equal(v.start, 360);
  assert.equal(v.end, 420);
  assert.equal(t.text, 'Every week on Tue and Thu, from Tue 6 Oct 2026, 06:00 to 07:00, 20 times, blocked');
  assert.equal(summaryText(summarize(items)), '1 new task including 1 repeating');
});

test('a daily free 30-minute task stays free and is not pushed when that setting is off', () => {
  const items = buildTimeReview({
    tasks: sheet('Tasks', [{ Name: 'Reading', Date: '05/10/2026', 'Start time': '21:00', 'Duration (minutes)': 30, Repeats: 'Daily', 'Time mode': 'Free' }]),
    existing: none,
    includeFree: false,
  });
  const v = items[0].values as TaskValues;
  assert.equal(v.timeMode, 'free');
  assert.equal(v.push, false);
  assert.equal(v.end, 21 * 60 + 30);
  // With the setting on, free tasks follow it; an explicit No always wins.
  assert.equal((buildTimeReview({ tasks: sheet('Tasks', [{ Name: 'Reading', Date: '05/10/2026', 'Start time': '21:00', 'Time mode': 'Free' }]), existing: none, includeFree: true })[0].values as TaskValues).push, true);
  assert.equal((buildTimeReview({ tasks: sheet('Tasks', [{ Name: 'X', Date: '05/10/2026', 'Start time': '21:00', 'Time mode': 'Blocked', 'Push to Google Calendar': 'No' }]), existing: none })[0].values as TaskValues).push, false);
});

test('blank time mode uses the default for the type; End time wins over Duration with a note', () => {
  const items = buildTimeReview({
    tasks: sheet('Tasks', [{ Name: 'Standup', Type: 'Meeting', Date: '05/10/2026', 'Start time': '09:00', 'End time': '09:15', 'Duration (minutes)': 30 }]),
    existing: none,
    defaultMode: (type) => (type === 'Meeting' ? 'blocked' : 'free'),
  });
  const v = items[0].values as TaskValues;
  assert.equal(v.type, 'Meeting');
  assert.equal(v.timeMode, 'blocked');
  assert.equal(v.end, 9 * 60 + 15);
  assert.match(items[0].notes[0], /End time and Duration disagree/);
});

const work: TimeExisting = {
  areas: [{ id: 'a1', name: 'Work', archived: false, emoji: null, color: '#000', description: '' }],
  sections: [],
  projects: [{ id: 'p1', name: 'Internships 2026', archived: false, areaId: 'a1', sectionId: null, description: '', start: null, end: null, status: 'Active', priority: 'Medium', tags: [] }],
  tasks: [
    { id: 't1', projectId: 'p1', title: 'Send applications', notes: '', type: 'ToDo', status: 'Pending', quadrant: null, priority: 'Medium', date: null, allDay: true, start: null, end: null, timeMode: 'free', rrule: null, tags: [] },
  ],
};

test('existing area and project are linked, never recreated; same-named tasks there are duplicates skipped by default', () => {
  const items = buildTimeReview({
    projects: sheet('Projects', [{ Name: 'Internships 2026', Area: 'work' }]),
    tasks: sheet('Tasks', [
      { Name: 'send  applications', Project: 'Internships 2026' },
      { Name: 'Prepare interviews', Project: 'Internships 2026' },
    ]),
    existing: work,
  });
  const area = items.find((i) => i.kind === 'area')!;
  assert.equal(area.status, 'linked');
  assert.equal(area.decision, 'skip');
  const project = items.find((i) => i.kind === 'project')!;
  assert.equal(project.status, 'duplicate');
  assert.equal(project.match?.id, 'p1');
  assert.equal(task(items, 'send  applications').status, 'duplicate');
  assert.equal(task(items, 'send  applications').decision, 'skip');
  assert.equal(task(items, 'Prepare interviews').status, 'new');
  const s = summarize(items);
  assert.equal(s.created.area, undefined);
  assert.equal(s.created.project, undefined);
  assert.equal(summaryText(s), '1 area linked to existing, 1 new task, 2 duplicates skipped');
});

test('a project only tasks name is linked when it exists and created when it does not', () => {
  const items = buildTimeReview({
    tasks: sheet('Tasks', [
      { Name: 'A', Project: 'internships  2026' },
      { Name: 'B', Project: 'Garden' },
    ]),
    existing: work,
  });
  const projects = items.filter((i) => i.kind === 'project');
  assert.deepEqual(
    projects.map((p) => [p.name, p.status, p.rowNumber]),
    [
      ['internships  2026', 'linked', null],
      ['Garden', 'new', null],
    ]
  );
  assert.deepEqual(impliedText(items), ['1 new project will be created: Garden']);
});

test('new areas and sections named by projects are created once, listed in the summary', () => {
  const items = buildTimeReview({
    projects: sheet('Projects', [
      { Name: 'French B1', Area: 'Learning', Section: 'Courses' },
      { Name: 'Spanish A2', Area: 'learning', Section: 'courses' },
      { Name: 'Run 10k', Area: 'Fitness' },
    ]),
    existing: none,
  });
  assert.deepEqual(impliedText(items), ['2 new areas will be created: Learning, Fitness', '1 new section will be created: Courses']);
  assert.equal(summaryText(summarize(items)), '2 new areas, 1 new section, 3 new projects');
});

test('two identical task rows: the second is flagged', () => {
  const items = buildTimeReview({ tasks: sheet('Tasks', [{ Name: 'Dig', Project: 'Garden' }, { Name: 'dig ', Project: 'garden' }]), existing: none });
  const tasks = items.filter((i) => i.kind === 'task');
  assert.equal(tasks[1].status, 'duplicate');
  assert.equal(tasks[1].match?.sameFile, true);
  assert.equal(tasks[1].canCreateAnyway, true);
});

test('Update existing lists only the fields that differ', () => {
  const existing: TimeExisting = {
    ...none,
    tasks: [{ id: 't1', projectId: null, title: 'Gym', notes: 'Legs', type: 'ToDo', status: 'Pending', quadrant: null, priority: 'Medium', date: '2026-10-06', allDay: false, start: 360, end: 420, timeMode: 'free', rrule: null, tags: [] }],
  };
  const items = buildTimeReview({
    tasks: sheet('Tasks', [{ Name: 'Gym', Description: 'Legs', Date: '06/10/2026', 'Start time': '06:00', 'End time': '07:00', 'Time mode': 'Blocked', Repeats: 'Weekly', 'On days': 'Tue, Thu' }]),
    existing,
  });
  const t = items[0];
  assert.equal(t.status, 'duplicate');
  assert.deepEqual(t.changes, [
    { field: 'Time mode', from: 'Free', to: 'Blocked' },
    { field: 'Repeats', from: 'none', to: 'Every week on Tue and Thu' },
  ]);
});

test('importing the same rows again creates nothing', () => {
  const rows = [{ Name: 'Internships 2026', Area: 'Work' }];
  const items = buildTimeReview({ projects: sheet('Projects', rows), tasks: sheet('Tasks', [{ Name: 'Send applications', Project: 'Internships 2026' }]), existing: work });
  const s = summarize(items);
  assert.deepEqual(s.created, {});
  assert.equal(s.updated, 0);
});

test('an old-template file still imports: Title, Notes, Start Time and Due Date', () => {
  const rows = [{ Title: 'Book venue', Project: 'Wedding', Priority: 'High', 'Start Time': '05/11/2026 09:00', 'Due Date': '05/11/2026 10:30', Notes: 'Two quotes' }];
  const items = buildTimeReview({ tasks: sheet('Tasks', rows), existing: none });
  const v = task(items, 'Book venue').values as TaskValues;
  assert.equal(v.date, '2026-11-05');
  assert.equal(v.start, 540);
  assert.equal(v.end, 630);
  assert.equal(v.description, 'Two quotes');
  assert.equal(v.priority, 'High');
  assert.equal(v.quadrant, null);
});

test('problems block until fixed or skipped', () => {
  const items = buildTimeReview({ tasks: sheet('Tasks', [{ Name: 'Dig', Date: 'soon', Repeats: 'Weekly', Ends: 'On date' }]), existing: none });
  const t = task(items, 'Dig');
  assert.equal(t.status, 'problem');
  assert.equal(t.decided, false);
  assert.equal(summarize(items).needAttention, 1);
});

// ---- Money review ----

const bank: MoneyExisting = {
  wallets: [{ id: 'w1', name: 'UBA', type: 'Current Account', archived: false }],
  baskets: [
    { id: 'b1', name: 'Home', type: 'Expense', kind: 'Fixed', archived: false, categoryId: null, defaultPaidFrom: 'account:w1' },
    { id: 'b2', name: 'Salary', type: 'Income', kind: 'Fixed', archived: false, categoryId: null, defaultPaidFrom: null },
  ],
  items: [
    { id: 'i1', basketId: 'b1', name: 'Rent', amount: 150000, priority: 'High', necessity: 'MustHave', dueDay: 5, accountId: 'w1', frequency: 'Monthly' },
    { id: 'i2', basketId: 'b2', name: 'AIMS salary', amount: 900000, priority: 'High', necessity: 'MustHave', dueDay: 25, accountId: null, frequency: 'Monthly' },
  ],
  categories: [],
};
function msheet(name: string, rows: Record<string, unknown>[]): SheetRows {
  return { sheet: name, rows, mapping: mapColumns(specFor('money', name)!, headersOf(rows)) };
}

test('money: wallets and baskets match by name (baskets by name and type), items inside their basket', () => {
  const items = buildMoneyReview({
    wallets: msheet('Wallets', [{ Name: 'uba', Type: 'Bank' }, { Name: 'MTN MoMo', Type: 'Mobile money', 'Opening balance': '50,000' }]),
    baskets: msheet('Baskets', [{ Name: 'Home', Type: 'Expenses' }, { Name: 'Home', Type: 'Savings' }]),
    items: msheet('Basket items', [
      { Basket: 'home', Name: 'rent', Amount: 160000, 'Due day or date': 5 },
      { Basket: 'Home', Name: 'Electricity', Amount: 20000, 'Due day or date': 10, 'Paid from': 'MTN MoMo' },
    ]),
    existing: bank,
    thisMonth: '2026-10',
  });
  const by = (kind: string, name: string) => items.find((i) => i.kind === kind && i.name === name)!;
  assert.equal(by('wallet', 'uba').status, 'duplicate');
  assert.equal(by('wallet', 'MTN MoMo').status, 'new');
  assert.equal((by('wallet', 'MTN MoMo').values as { opening: number }).opening, 50000);
  assert.equal(items.filter((i) => i.kind === 'basket' && i.name === 'Home').map((i) => i.status).join(','), 'duplicate,new');
  const rent = by('basketItem', 'rent');
  assert.equal(rent.status, 'duplicate');
  assert.deepEqual(rent.changes, [{ field: 'Amount', from: '150,000', to: '160,000' }]);
  const elec = by('basketItem', 'Electricity');
  assert.equal(elec.status, 'new');
  assert.equal((elec.values as BasketItemValues).frequency, 'Monthly');
});

test('money: income sources are items of the Income basket; duplicates by name', () => {
  const items = buildMoneyReview({
    income: msheet('Income sources', [
      { Name: 'AIMS salary', Amount: 1013381, 'Expected day': 25 },
      { Name: 'Tutoring', Amount: 50000, 'Expected day': 10, 'Received into': 'UBA' },
    ]),
    existing: bank,
    thisMonth: '2026-10',
  });
  const basket = items.find((i) => i.kind === 'basket')!;
  assert.equal(basket.status, 'linked');
  assert.equal(basket.name, 'Salary');
  assert.equal(items.find((i) => i.name === 'AIMS salary')!.status, 'duplicate');
  assert.equal(items.find((i) => i.name === 'Tutoring')!.status, 'new');
  assert.equal(items.find((i) => i.kind === 'wallet')!.status, 'linked');
});

test('money: a Fixed basket item without a due day is a problem', () => {
  const items = buildMoneyReview({ items: msheet('Basket items', [{ Basket: 'Home', Name: 'Water', Amount: 8000 }]), existing: bank, thisMonth: '2026-10' });
  assert.equal(items.find((i) => i.name === 'Water')!.status, 'problem');
});

// ---- Generated files ----

test('each template has Read me, a hidden Lists sheet, its data sheets, Example rows and dropdowns', async () => {
  for (const [kind, sheets] of [
    ['time', TIME_SHEETS],
    ['money', MONEY_SHEETS],
  ] as const) {
    const wb = await buildTemplate(kind, { projects: ['Internships 2026'], wallets: ['UBA'] });
    assert.deepEqual(
      wb.worksheets.map((w) => w.name),
      ['Read me', 'Lists', ...sheets.map((s) => s.name)]
    );
    assert.equal(wb.getWorksheet('Lists')!.state, 'hidden');
    for (const s of sheets) {
      const ws = wb.getWorksheet(s.name)!;
      assert.equal(ws.getCell('A1').value, 'Row type');
      assert.equal(ws.getCell('A2').value, 'Example');
      assert.equal(ws.views[0].state, 'frozen');
      const model = (ws as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations.model;
      assert.ok(Object.keys(model).length > 0, `${s.name} has dropdowns`);
    }
  }
});
