// The spreadsheet import's decisions (src/shared/import/projectTasks.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMap,
  buildReview,
  normalizeName,
  parseDate,
  parseImportance,
  parseRepeats,
  parseTime,
  similarity,
  summarize,
  summaryText,
  type ExistingData,
  type ProjectField,
  type TaskField,
} from '../app/src/shared/import/projectTasks';

test('columns are matched by header and synonyms, case-insensitively', () => {
  const m = autoMap<TaskField>(['Project', 'Task', 'Due date', 'Start Time', 'END', 'Urgent', 'Important', 'Checklist', 'Notes', 'Whatever'], 'tasks');
  assert.equal(m['Task'], 'name');
  assert.equal(m['Due date'], 'date');
  assert.equal(m['Start Time'], 'start');
  assert.equal(m['END'], 'end');
  assert.equal(m['Checklist'], 'subtasks');
  assert.equal(m['Notes'], 'description');
  assert.equal(m['Whatever'], 'ignore');
  const p = autoMap<ProjectField>(['Name', 'Deadline', 'Area'], 'projects');
  assert.equal(p['Deadline'], 'end');
  // A remembered choice wins.
  assert.equal(autoMap<TaskField>(['Due date'], 'tasks', { 'due date': 'ignore' })['Due date'], 'ignore');
});

test('dates: day first by default, ISO and Excel numbers; nonsense is unreadable', () => {
  assert.deepEqual(parseDate('05/10/2026'), { date: '2026-10-05', invalid: false });
  assert.deepEqual(parseDate('05/10/2026', false), { date: '2026-05-10', invalid: false });
  assert.deepEqual(parseDate('2026-10-05'), { date: '2026-10-05', invalid: false });
  assert.deepEqual(parseDate(46300), { date: '2026-10-05', invalid: false });
  assert.equal(parseDate('31/02/2026').invalid, true);
  assert.equal(parseDate('next tuesday').invalid, true);
  assert.deepEqual(parseDate(''), { date: null, invalid: false });
});

test('times: 24-hour and am/pm', () => {
  assert.equal(parseTime('14:30').minutes, 870);
  assert.equal(parseTime('2:30 pm').minutes, 870);
  assert.equal(parseTime('9am').minutes, 540);
  assert.equal(parseTime('12am').minutes, 0);
  assert.equal(parseTime('25:00').invalid, true);
});

test('importance words and urgent/important columns', () => {
  assert.equal(parseImportance('Do first'), 'do');
  assert.equal(parseImportance('Schedule'), 'schedule');
  assert.equal(parseImportance('', 'yes', 'no'), 'delegate');
  assert.equal(parseImportance('', 'no', 'yes'), 'schedule');
  assert.equal(parseImportance(''), null);
});

test('repeats become RRULEs', () => {
  assert.equal(parseRepeats('weekly on Monday').rrule, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
  assert.equal(parseRepeats('Every 2 weeks').rrule, 'FREQ=WEEKLY;INTERVAL=2');
  assert.equal(parseRepeats('daily').rrule, 'FREQ=DAILY;INTERVAL=1');
  assert.equal(parseRepeats('when I feel like it').invalid, true);
});

test('names: normalized, similar ones found', () => {
  assert.equal(normalizeName('  Running   Douala! '), 'running douala');
  assert.ok(similarity('Kitchen renovation', 'Kitchen renovations') >= 0.9);
  assert.ok(similarity('Kitchen', 'Garden') < 0.9);
});

// 3 projects, 45 tasks (15 each); "House move" and 3 of its tasks exist.
function twoSheetFile() {
  const projects = ['House move', 'Garden', 'Taxes 2026'].map((name) => ({ Name: name, Area: 'Home', 'End date': '30/11/2026' }));
  const tasks = projects.flatMap((p, i) =>
    Array.from({ length: 15 }, (_, j) => ({ Project: p.Name, Name: `Step ${j + 1}`, Date: `${String(j + 1).padStart(2, '0')}/10/2026` }))
  );
  void tasks;
  return {
    projectRows: { sheet: 'Projects', rows: projects, mapping: autoMap<ProjectField>(Object.keys(projects[0]), 'projects') },
    taskRows: { sheet: 'Tasks', rows: tasks, mapping: autoMap<TaskField>(Object.keys(tasks[0]), 'tasks') },
  };
}

const existing: ExistingData = {
  projects: [{ id: 'p1', name: 'House move', archived: false, description: '', startDate: null, endDate: null, areaName: 'Home' }],
  tasks: [1, 2, 3].map((n) => ({ id: `t${n}`, projectId: 'p1', title: `Step ${n}`, date: `2026-10-0${n}`, notes: '' })),
};

test('a two-sheet import skips what already exists, by default', () => {
  const items = buildReview({ ...twoSheetFile(), existing });
  const s = summarize(items);
  assert.equal(s.newProjects, 2);
  assert.equal(s.newTasks, 42);
  assert.equal(s.skippedDuplicates, 4);
  assert.equal(s.needAttention, 0);
  assert.equal(summaryText(s), '2 new projects, 42 new tasks, 4 skipped as duplicates');
});

test('importing again creates nothing', () => {
  const file = twoSheetFile();
  const everything: ExistingData = {
    projects: file.projectRows.rows.map((p, i) => ({ id: `p${i}`, name: p.Name, archived: false, description: '', startDate: null, endDate: '2026-11-30', areaName: 'Home' })),
    tasks: file.taskRows.rows.map((t, i) => ({
      id: `t${i}`,
      projectId: `p${['House move', 'Garden', 'Taxes 2026'].indexOf(t.Project)}`,
      title: t.Name,
      date: parseDate(t.Date).date,
      notes: '',
    })),
  };
  const s = summarize(buildReview({ ...file, existing: everything }));
  assert.equal(s.newProjects + s.newTasks + s.updatedProjects + s.updatedTasks, 0);
});

test('an archived project matches too; a near name is a possible duplicate that needs a choice', () => {
  const items = buildReview({
    projectRows: { sheet: 'Projects', rows: [{ Name: 'house move' }, { Name: 'Garden 2025' }], mapping: { Name: 'name' } },
    taskRows: null,
    existing: { projects: [{ id: 'a', name: 'House Move', archived: true, description: '', startDate: null, endDate: null, areaName: null }, { id: 'b', name: 'Garden 2026', archived: false, description: '', startDate: null, endDate: null, areaName: null }], tasks: [] },
  });
  assert.equal(items[0].status, 'duplicate');
  assert.equal(items[0].match?.archived, true);
  assert.equal(items[1].status, 'possible');
  assert.equal(summarize(items).needAttention, 1);
});

test('an unreadable date is a problem that blocks the import until fixed or skipped', () => {
  const items = buildReview({
    projectRows: null,
    taskRows: { sheet: 'Tasks', rows: [{ Project: 'Garden', Name: 'Dig', Date: 'soon' }], mapping: { Project: 'project', Name: 'name', Date: 'date' } },
    existing: { projects: [], tasks: [] },
  });
  const task = items.find((i) => i.kind === 'task')!;
  assert.equal(task.status, 'problem');
  assert.deepEqual(task.problems, ['Unreadable date']);
  assert.equal(summarize(items).needAttention, 1);
  task.decided = true; // Skip
  assert.equal(summarize(items).needAttention, 0);
});

test('duplicates inside the file are caught', () => {
  const items = buildReview({
    projectRows: null,
    taskRows: { sheet: 'Tasks', rows: [{ Project: 'Garden', Name: 'Dig' }, { Project: 'Garden', Name: 'dig ' }], mapping: { Project: 'project', Name: 'name' } },
    existing: { projects: [], tasks: [] },
  });
  const tasks = items.filter((i) => i.kind === 'task');
  assert.equal(tasks[1].status, 'duplicate');
  assert.equal(tasks[1].match?.sameFile, true);
});
