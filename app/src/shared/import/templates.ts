// The two spreadsheet templates, Time (areas, sections, projects, tasks)
// and Money (wallets, income sources, baskets, basket items), described
// once: their sheets, columns, fixed options (the app's own), examples and
// the Read me text. The downloaded file (buildTemplate.ts), the column
// matching and the detection of an uploaded file all read these.
// Every data sheet starts with "Row type": a row marked Example is ignored.
// Pure; tested in test/importTemplates.test.ts.

import { nameKey } from './names';

export type TemplateKind = 'time' | 'money';

/** A list the user's own names fill in (dropdowns of real names, free typing allowed). */
export type NameList = 'areas' | 'sections' | 'projects' | 'wallets' | 'baskets' | 'categories';

export interface ColumnSpec {
  key: string;
  header: string;
  required?: boolean;
  /** Fixed choices (a strict dropdown), or the user's own names (a dropdown that allows new ones). */
  options?: readonly string[];
  names?: NameList;
  /** The dropdown suggests but doesn't insist (On days takes several: "Tue, Thu"). */
  loose?: boolean;
  /** How it reads: 'date' dd/mm/yyyy, 'time' HH:MM, 'number'. */
  format?: 'date' | 'time' | 'number';
  width: number;
  help: string;
  /** Other headers that mean this column (and the old template's). */
  synonyms?: string[];
}

export interface SheetSpec {
  name: string;
  /** What the sheet holds, for the Read me. */
  about: string;
  columns: ColumnSpec[];
  example: Record<string, string | number>;
}

export const ROW_TYPE: ColumnSpec = { key: 'rowType', header: 'Row type', options: ['Example'], width: 11, help: 'Leave empty. Rows marked Example are ignored.' };

const YES_NO = ['Yes', 'No'] as const;

// ---- Fixed options (the app's own) ----
export const TIME_OPTIONS = {
  types: ['Todo', 'Meeting', 'Event'],
  taskStatuses: ['Pending', 'Done', 'Cancelled'],
  importance: ['Do first', 'Schedule', 'Delegate', 'Eliminate'],
  priorities: ['High', 'Medium', 'Low'],
  timeModes: ['Blocked', 'Free'],
  repeats: ['Daily', 'Weekdays', 'Weekly', 'Monthly', 'Yearly'],
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  monthlyBy: ['Day of month', 'Weekday of month'],
  weekOfMonth: ['First', 'Second', 'Third', 'Fourth', 'Last'],
  ends: ['Never', 'On date', 'After'],
  projectStatuses: ['Active', 'Completed', 'Archived'],
  yesNo: YES_NO,
} as const;

export const MONEY_OPTIONS = {
  walletTypes: ['Mobile money', 'Bank', 'Card', 'Cash', 'Savings'],
  incomeRepeats: ['Monthly', 'Weekly', 'Once'],
  incomeSubtypes: ['Earned', 'Other', 'Debt financing'],
  basketTypes: ['Income', 'Expenses', 'Savings', 'Transfers'],
  basketKinds: ['Fixed', 'Variable'],
  basketRepeats: ['Every month', 'This month only'],
  needs: ['Must have', 'Nice to have'],
  priorities: ['High', 'Medium', 'Low'],
  itemRepeats: ["Doesn't repeat", 'Monthly', 'Weekly'],
  automation: ['Off', 'Remind me', 'Prepare for confirmation'],
  yesNo: YES_NO,
} as const;

// ---- Time ----
export const TIME_SHEETS: SheetSpec[] = [
  {
    name: 'Areas',
    about: 'The big parts of your life (Work, Health, Family). Projects and sections belong to an area.',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 24, help: 'The area. An area that already exists (same name, capitals and spaces ignored) is never created again.' },
      { key: 'icon', header: 'Icon', width: 8, help: 'One emoji (optional).', synonyms: ['emoji'] },
      { key: 'color', header: 'Color', width: 12, help: 'A color such as #3965fa (optional).', synonyms: ['colour'] },
      { key: 'description', header: 'Description', width: 40, help: 'What the area covers.' },
      { key: 'archived', header: 'Archived', options: YES_NO, width: 10, help: 'Yes or No (No if empty).' },
    ],
    example: { name: 'Learning', icon: '', color: '#3965fa', description: 'Courses, languages and reading', archived: 'No' },
  },
  {
    name: 'Sections',
    about: 'Groups of projects inside an area (Courses inside Learning).',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 24, help: 'The section. The same name in the same area is never created again.' },
      { key: 'area', header: 'Area', required: true, names: 'areas', width: 22, help: 'The area it belongs to: an existing one, or one on the Areas sheet.' },
      { key: 'icon', header: 'Icon', width: 8, help: 'One emoji (optional).', synonyms: ['emoji'] },
      { key: 'color', header: 'Color', width: 12, help: 'A color such as #3965fa (optional).', synonyms: ['colour'] },
      { key: 'description', header: 'Description', width: 40, help: 'What the section is for.' },
      { key: 'archived', header: 'Archived', options: YES_NO, width: 10, help: 'Yes or No (No if empty).' },
    ],
    example: { name: 'Courses', area: 'Learning', icon: '', color: '', description: 'Online and evening courses', archived: 'No' },
  },
  {
    name: 'Projects',
    about: 'Projects, each in an area (and a section if you like).',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 28, help: 'The project. An existing project (archived ones too) is never created again.', synonyms: ['project', 'project name', 'title'] },
      { key: 'area', header: 'Area', names: 'areas', width: 22, help: 'An existing area or one on the Areas sheet. Empty: no area.', synonyms: ['area of life', 'life area', 'category'] },
      { key: 'section', header: 'Section', names: 'sections', width: 22, help: 'A section of that area (optional).' },
      { key: 'color', header: 'Color', width: 12, help: 'A color such as #3965fa (optional).', synonyms: ['colour'] },
      { key: 'priority', header: 'Priority', options: TIME_OPTIONS.priorities, width: 10, help: 'High, Medium or Low (Medium if empty).' },
      { key: 'start', header: 'Start date', format: 'date', width: 12, help: 'dd/mm/yyyy.', synonyms: ['start'] },
      { key: 'end', header: 'End date', format: 'date', width: 12, help: 'dd/mm/yyyy.', synonyms: ['end'] },
      { key: 'deadline', header: 'Deadline', format: 'date', width: 12, help: 'dd/mm/yyyy: the date it must be done by (optional).', synonyms: ['due date', 'due'] },
      { key: 'status', header: 'Status', options: TIME_OPTIONS.projectStatuses, width: 12, help: 'Active, Completed or Archived (Active if empty).', synonyms: ['state'] },
      { key: 'description', header: 'Description', width: 40, help: 'What the project is about.', synonyms: ['notes'] },
      { key: 'tags', header: 'Tags', width: 20, help: 'Comma separated.', synonyms: ['labels', 'tag'] },
    ],
    example: {
      name: 'French B1',
      area: 'Learning',
      section: 'Courses',
      color: '',
      priority: 'Medium',
      start: '05/10/2026',
      end: '20/12/2026',
      deadline: '',
      status: 'Active',
      description: 'Pass the B1 exam',
      tags: 'languages, exams',
    },
  },
  {
    name: 'Tasks',
    about: 'Tasks, each in a project (or none). A repeating task is one row: it becomes one recurring task, not a task per date.',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 28, help: 'The task. The same name in the same project is a duplicate.', synonyms: ['title', 'task', 'task name'] },
      { key: 'project', header: 'Project', names: 'projects', width: 24, help: 'An existing project or one on the Projects sheet. Empty: no project.', synonyms: ['project name'] },
      { key: 'type', header: 'Type', options: TIME_OPTIONS.types, width: 10, help: 'Todo, Meeting or Event (Todo if empty).', synonyms: ['kind', 'task type'] },
      { key: 'status', header: 'Status', options: TIME_OPTIONS.taskStatuses, width: 11, help: 'Pending, Done or Cancelled (Pending if empty).', synonyms: ['state', 'done'] },
      { key: 'importance', header: 'Importance', options: TIME_OPTIONS.importance, width: 12, help: 'Do first, Schedule, Delegate or Eliminate (optional).', synonyms: ['quadrant', 'eisenhower'] },
      { key: 'priority', header: 'Priority', options: TIME_OPTIONS.priorities, width: 10, help: 'High, Medium or Low (Medium if empty).', synonyms: ['priority label'] },
      { key: 'description', header: 'Description', width: 36, help: 'Notes for the task.', synonyms: ['notes', 'details'] },
      { key: 'tags', header: 'Tags', width: 18, help: 'Comma separated.', synonyms: ['labels', 'tag'] },
      { key: 'subtasks', header: 'Subtasks', width: 30, help: 'Separated by ";" (Buy book; Read chapter 1).', synonyms: ['checklist', 'steps', 'sub tasks'] },
      { key: 'date', header: 'Date', format: 'date', width: 12, help: 'dd/mm/yyyy. For a repeating task, its first date.', synonyms: ['day', 'due', 'when'] },
      { key: 'allDay', header: 'All day', options: YES_NO, width: 9, help: 'Yes for a task without a time (No if empty).' },
      { key: 'start', header: 'Start time', format: 'time', width: 10, help: 'HH:MM, 24-hour (06:00).', synonyms: ['start', 'from', 'begins'] },
      { key: 'end', header: 'End time', format: 'time', width: 10, help: 'HH:MM. If both End time and Duration are given, End time wins.', synonyms: ['end', 'to', 'finish'] },
      { key: 'duration', header: 'Duration (minutes)', format: 'number', width: 12, help: 'Minutes, when there is no End time.', synonyms: ['duration', 'minutes', 'length'] },
      { key: 'timeMode', header: 'Time mode', options: TIME_OPTIONS.timeModes, width: 11, help: 'Blocked (busy, checked against your calendar) or Free. Empty: your default for the type.', synonyms: ['mode'] },
      { key: 'push', header: 'Push to Google Calendar', options: YES_NO, width: 14, help: 'Yes or No. Empty: Yes for Blocked, your setting for Free.', synonyms: ['google', 'push to google', 'google calendar'] },
      { key: 'repeats', header: 'Repeats', options: TIME_OPTIONS.repeats, width: 11, help: 'Daily, Weekdays, Weekly, Monthly or Yearly. Empty: a one-off task.', synonyms: ['repeat', 'recurrence', 'recurring', 'frequency'] },
      { key: 'every', header: 'Every', format: 'number', width: 8, help: 'A number: 2 with Weekly is every 2 weeks (1 if empty).', synonyms: ['interval'] },
      { key: 'onDays', header: 'On days', options: TIME_OPTIONS.weekdays, loose: true, width: 14, help: 'Weekly: Mon, Tue, Wed, Thu, Fri, Sat, Sun, comma separated (the weekday of Date if empty). Monthly by weekday: one day.' },
      { key: 'monthlyBy', header: 'Monthly by', options: TIME_OPTIONS.monthlyBy, width: 16, help: 'Day of month (the day of Date) or Weekday of month.' },
      { key: 'weekOfMonth', header: 'Week of month', options: TIME_OPTIONS.weekOfMonth, width: 12, help: 'With Weekday of month: First, Second, Third, Fourth or Last.' },
      { key: 'ends', header: 'Ends', options: TIME_OPTIONS.ends, width: 10, help: 'Never, On date or After (Never if empty).' },
      { key: 'endDate', header: 'End date', format: 'date', width: 12, help: 'dd/mm/yyyy, when Ends is On date.', synonyms: ['until', 'repeat until', 'ends on'] },
      { key: 'occurrences', header: 'Occurrences', format: 'number', width: 11, help: 'How many times, when Ends is After.', synonyms: ['count', 'times'] },
      { key: 'skipDates', header: 'Skip dates', width: 22, help: 'Dates to leave out, dd/mm/yyyy separated by ";".', synonyms: ['skip', 'exceptions'] },
      { key: 'rrule', header: 'RRULE', width: 30, help: 'Advanced. If filled, it replaces the repeat columns: FREQ=WEEKLY;BYDAY=TU,TH;COUNT=20.' },
    ],
    example: {
      name: 'Study session',
      project: 'French B1',
      type: 'Todo',
      status: 'Pending',
      importance: 'Schedule',
      priority: 'Medium',
      description: 'Grammar and vocabulary',
      tags: 'study',
      subtasks: 'Review notes; Exercises',
      date: '06/10/2026',
      allDay: 'No',
      start: '06:00',
      end: '07:00',
      duration: '',
      timeMode: 'Blocked',
      push: 'Yes',
      repeats: 'Weekly',
      every: 1,
      onDays: 'Tue, Thu',
      monthlyBy: '',
      weekOfMonth: '',
      ends: 'After',
      endDate: '',
      occurrences: 20,
      skipDates: '',
      rrule: '',
    },
  },
];

// ---- Money ----
export const MONEY_SHEETS: SheetSpec[] = [
  {
    name: 'Wallets',
    about: 'Where your money is: mobile money, bank accounts, cards, cash and savings.',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 24, help: 'The wallet. An existing wallet with the same name is never created again.' },
      { key: 'type', header: 'Type', options: MONEY_OPTIONS.walletTypes, width: 14, help: 'Mobile money, Bank, Card, Cash or Savings.' },
      { key: 'opening', header: 'Opening balance', format: 'number', width: 16, help: 'What is in it today (0 if empty).', synonyms: ['balance', 'starting balance'] },
      { key: 'usable', header: 'Usable for the plan', options: YES_NO, width: 14, help: 'Savings wallets only: may the plan count on it?' },
    ],
    example: { name: 'MTN Mobile Money', type: 'Mobile money', opening: 150000, usable: '' },
  },
  {
    name: 'Income sources',
    about: 'Money you expect: salary, business income, support.',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 24, help: 'The income. An existing one with the same name is never created again.' },
      { key: 'amount', header: 'Amount', format: 'number', width: 14, help: 'How much each time.' },
      { key: 'day', header: 'Expected day', format: 'number', width: 12, help: 'Day of the month it arrives (1 to 31).' },
      { key: 'repeats', header: 'Repeats', options: MONEY_OPTIONS.incomeRepeats, width: 11, help: 'Monthly, Weekly or Once (Monthly if empty).' },
      { key: 'subtype', header: 'Subtype', options: MONEY_OPTIONS.incomeSubtypes, width: 14, help: 'Earned, Other or Debt financing (Earned if empty).' },
      { key: 'wallet', header: 'Received into', names: 'wallets', width: 22, help: 'An existing wallet or one on the Wallets sheet.' },
    ],
    example: { name: 'AIMS salary', amount: 1013381, day: 25, repeats: 'Monthly', subtype: 'Earned', wallet: 'MTN Mobile Money' },
  },
  {
    name: 'Baskets',
    about: 'Baskets group what you plan to pay, save or move.',
    columns: [
      { key: 'name', header: 'Name', required: true, width: 24, help: 'The basket. The same name and type is never created again.' },
      { key: 'type', header: 'Type', options: MONEY_OPTIONS.basketTypes, width: 12, help: 'Income, Expenses, Savings or Transfers (Expenses if empty).' },
      { key: 'kind', header: 'Kind', options: MONEY_OPTIONS.basketKinds, width: 10, help: 'Expenses only: Fixed (set bills) or Variable (a limit used through the month).' },
      { key: 'category', header: 'Category', names: 'categories', width: 20, help: 'An existing category (optional).' },
      { key: 'starts', header: 'Starts', format: 'date', width: 12, help: 'The first month: any date in it, dd/mm/yyyy (this month if empty).' },
      { key: 'repeats', header: 'Repeats', options: MONEY_OPTIONS.basketRepeats, width: 15, help: 'Every month or This month only (Every month if empty).' },
      { key: 'paidFrom', header: 'Default paid from', names: 'wallets', width: 22, help: 'The wallet its items are paid from (optional).' },
    ],
    example: { name: 'Home', type: 'Expenses', kind: 'Fixed', category: '', starts: '01/10/2026', repeats: 'Every month', paidFrom: 'MTN Mobile Money' },
  },
  {
    name: 'Basket items',
    about: 'What each basket plans: rent, school fees, groceries.',
    columns: [
      { key: 'basket', header: 'Basket', required: true, names: 'baskets', width: 20, help: 'An existing basket or one on the Baskets sheet.' },
      { key: 'name', header: 'Name', required: true, width: 24, help: 'The item. The same name in the same basket is a duplicate.' },
      { key: 'amount', header: 'Amount', format: 'number', width: 14, help: 'The planned amount.' },
      { key: 'need', header: 'Need', options: MONEY_OPTIONS.needs, width: 13, help: 'Must have or Nice to have.' },
      { key: 'priority', header: 'Priority', options: MONEY_OPTIONS.priorities, width: 10, help: 'High, Medium or Low (Medium if empty).' },
      { key: 'repeats', header: 'Repeats', options: MONEY_OPTIONS.itemRepeats, width: 15, help: "Doesn't repeat, Monthly or Weekly (Monthly in a Fixed basket if empty)." },
      { key: 'due', header: 'Due day or date', width: 14, help: 'A day of the month (5) or a date (05/11/2026).' },
      { key: 'paidFrom', header: 'Paid from', names: 'wallets', width: 22, help: 'A wallet (the basket default if empty).' },
      { key: 'automation', header: 'Automation', options: MONEY_OPTIONS.automation, width: 22, help: 'Off, Remind me or Prepare for confirmation (Off if empty).' },
      { key: 'notBefore', header: 'Not before', format: 'date', width: 12, help: 'dd/mm/yyyy: not to be planned before this date.' },
      { key: 'neededBy', header: 'Needed by', format: 'date', width: 12, help: 'dd/mm/yyyy: needed by this date.' },
      { key: 'splittable', header: 'Splittable', options: YES_NO, width: 11, help: 'Yes if it can be paid in parts.' },
    ],
    example: {
      basket: 'Home',
      name: 'Rent',
      amount: 150000,
      need: 'Must have',
      priority: 'High',
      repeats: 'Monthly',
      due: 5,
      paidFrom: 'MTN Mobile Money',
      automation: 'Prepare for confirmation',
      notBefore: '',
      neededBy: '',
      splittable: 'No',
    },
  },
];

export const TEMPLATE_FILE: Record<TemplateKind, string> = { time: 'dreda-time-template.xlsx', money: 'dreda-money-template.xlsx' };
export const TEMPLATE_LABEL: Record<TemplateKind, string> = { time: 'Time template', money: 'Money template' };
export const TEMPLATE_ABOUT: Record<TemplateKind, string> = {
  time: 'Areas, sections, projects and tasks, with repeats and time mode.',
  money: 'Baskets, basket items, income sources and wallets.',
};

export function sheetsOf(kind: TemplateKind): SheetSpec[] {
  return kind === 'time' ? TIME_SHEETS : MONEY_SHEETS;
}

/** The Read me sheet's lines (one cell each; a heading starts with "# "). */
export function readMe(kind: TemplateKind): string[] {
  const lines: string[] = [];
  lines.push(`# Dreda ${kind === 'time' ? 'Time' : 'Money'} template`);
  lines.push('Fill in the sheets you need and leave the others empty. The first row of each sheet is an example marked "Example" in Row type: it is never imported, so you can keep it or delete it.');
  lines.push('Dates are dd/mm/yyyy. Times are HH:MM, 24-hour. Columns with a dropdown only take its values; columns of names (Area, Project, Wallet, Basket) list yours and also take a new name.');
  lines.push('');
  lines.push('# How the sheets link');
  if (kind === 'time') {
    lines.push('Sections name their area. Projects name their area and, if you like, a section of it. Tasks name their project, or leave it empty for no project.');
    lines.push('A name can point to something that already exists in Dreda or to a row elsewhere in this file. Only names found in neither are created.');
  } else {
    lines.push('Basket items name their basket. Income sources and baskets name wallets in Received into and Default paid from.');
    lines.push('A name can point to something that already exists in Dreda or to a row elsewhere in this file. Only names found in neither are created.');
  }
  for (const sheet of sheetsOf(kind)) {
    lines.push('');
    lines.push(`# ${sheet.name}`);
    lines.push(sheet.about);
    for (const c of sheet.columns) lines.push(`${c.header}${c.required ? ' (required)' : ''}: ${c.help}`);
  }
  if (kind === 'time') {
    lines.push('');
    lines.push('# Repeat examples');
    lines.push('Study session every Tuesday and Thursday, 06:00 to 07:00, for 10 weeks: Repeats Weekly, Every 1, On days Tue, Thu, Ends After, Occurrences 20, Time mode Blocked.');
    lines.push('Monthly review on the last Friday: Repeats Monthly, Monthly by Weekday of month, Week of month Last, On days Fri.');
    lines.push('Daily reading for 30 minutes in free time: Repeats Daily, Duration (minutes) 30, Time mode Free.');
    lines.push('Advanced: an RRULE such as FREQ=WEEKLY;BYDAY=TU,TH;COUNT=20 replaces the repeat columns.');
  }
  lines.push('');
  lines.push('# Duplicates');
  lines.push('Names match when they are the same after trimming spaces, collapsing double spaces and ignoring capitals ("Learning French" matches "learning  french"). Similar but different names are new.');
  lines.push(
    kind === 'time'
      ? 'An existing area, a section in the same area, a project (archived ones too) or a task in the same project is a duplicate: skipped unless you choose Update existing in the review. Rows repeated inside the file are caught too; the first is kept.'
      : 'An existing wallet, income source, basket of the same type or item in the same basket is a duplicate: skipped unless you choose Update existing in the review. Rows repeated inside the file are caught too; the first is kept.'
  );
  lines.push('Importing the same file twice creates nothing the second time. An import can be undone for 24 hours.');
  return lines;
}

// ---- Detecting an uploaded file ----

const TIME_NAMES = new Set(['areas', 'sections', 'projects', 'tasks']);
const MONEY_NAMES = new Set(['wallets', 'income sources', 'baskets', 'basket items', 'buckets', 'bucket items', 'money baskets']);

/**
 * Which template a file follows, from its sheet names, then its headers.
 * `old` is the earlier Time template (Title, Due Date, Start Time columns).
 */
export function detectTemplate(sheets: { name: string; headers: string[] }[]): { kind: TemplateKind | null; old: boolean } {
  let time = 0;
  let money = 0;
  for (const s of sheets) {
    const n = nameKey(s.name);
    if (TIME_NAMES.has(n)) time += 2;
    if (MONEY_NAMES.has(n)) money += 2;
    const h = s.headers.map(nameKey);
    if (h.includes('project') || h.includes('start time') || h.includes('time mode') || h.includes('title')) time += 1;
    if (h.includes('basket') || h.includes('amount') || h.includes('opening balance') || h.includes('paid from')) money += 1;
  }
  const kind = time === 0 && money === 0 ? null : time >= money ? 'time' : 'money';
  const tasks = sheets.find((s) => nameKey(s.name) === 'tasks');
  const old = kind === 'time' && Boolean(tasks) && tasks!.headers.map(nameKey).includes('title') && !tasks!.headers.map(nameKey).includes('name');
  return { kind, old };
}

/** The template sheet a file sheet is (by name, ignoring capitals), if any. */
export function specFor(kind: TemplateKind, sheetName: string): SheetSpec | null {
  const n = nameKey(sheetName);
  const alias: Record<string, string> = { buckets: 'baskets', 'money baskets': 'baskets', 'bucket items': 'basket items', income: 'income sources', accounts: 'wallets' };
  return sheetsOf(kind).find((s) => nameKey(s.name) === (alias[n] ?? n)) ?? null;
}

/**
 * Each header's column key: exact header first, then synonyms; the old Time
 * template's columns map to their new places (Title to Name, Notes to
 * Description, Due Date and Start Time to the date and times). Unknown
 * headers are 'ignore' (the person can map them). `remembered` (header to
 * key) wins.
 */
export function mapColumns(spec: SheetSpec, headers: string[], remembered: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const legacy: Record<string, string> = spec.name === 'Tasks' ? { 'due date': 'legacyDue', 'start time': 'legacyStart' } : {};
  const oldTasks = spec.name === 'Tasks' && headers.some((h) => nameKey(h) === 'title') && !headers.some((h) => nameKey(h) === 'name');
  for (const h of headers) {
    const k = nameKey(h);
    if (k === 'row type') {
      out[h] = 'rowType';
      continue;
    }
    if (remembered[k] && (remembered[k] === 'ignore' || !used.has(remembered[k]))) {
      out[h] = remembered[k];
      used.add(remembered[k]);
    }
  }
  for (const pass of [0, 1]) {
    for (const h of headers) {
      if (out[h]) continue;
      const k = nameKey(h);
      if (oldTasks && legacy[k]) {
        out[h] = legacy[k];
        continue;
      }
      const hit = spec.columns.find((c) => !used.has(c.key) && (pass === 0 ? nameKey(c.header) === k : (c.synonyms ?? []).includes(k)));
      if (hit) {
        out[h] = hit.key;
        used.add(hit.key);
      }
    }
  }
  for (const h of headers) if (!out[h]) out[h] = 'ignore';
  return out;
}
