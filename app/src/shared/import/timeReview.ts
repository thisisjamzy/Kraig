// The Time template's review: every row of the Areas, Sections, Projects
// and Tasks sheets read, checked and matched against what exists, by name
// only (names.ts). Names a row points to are linked to what exists or to
// another row of the file; only names found in neither are created (an
// item with rowNumber null). Repeats come from recurrenceColumns.ts.
// The old template (Title, Due Date, Start Time) still reads. Pure; tested
// in test/importTemplates.test.ts. src/logic/importData/useProjectImport.ts
// checks time conflicts and writes.

import type { Quadrant, TimeMode } from '../firestore/types';
import type { RecurrenceRule } from '../../viewmodels/recurrence';
import { nameKey } from './names';
import { cellText, parseDate, parseImportance, parseSubtasks, parseTime } from './projectTasks';
import { parseRepeatCells } from './recurrenceColumns';
import { TIME_OPTIONS } from './templates';
import { byName, cell, diff, oneOf, settle, skippedRow, yesNo, type Change, type Mapping, type ReviewItem, type Row } from './review';

export interface SheetRows {
  sheet: string;
  rows: Row[];
  mapping: Mapping;
}

export interface AreaValues {
  name: string;
  icon: string;
  color: string;
  description: string;
  archived: boolean | null;
}
export interface SectionValues extends AreaValues {
  area: string;
}
export interface ProjectValues {
  name: string;
  area: string;
  section: string;
  color: string;
  priority: 'High' | 'Medium' | 'Low' | null;
  start: string | null;
  end: string | null;
  status: 'Active' | 'Completed' | 'Archived' | null;
  description: string;
  tags: string[];
}
export interface TaskValues {
  name: string;
  project: string;
  type: string;
  status: 'Pending' | 'Done' | 'Cancelled';
  quadrant: Quadrant | null;
  priority: 'High' | 'Medium' | 'Low' | null;
  description: string;
  tags: string[];
  subtasks: string[];
  date: string | null;
  allDay: boolean;
  /** Minutes after midnight. */
  start: number | null;
  end: number | null;
  timeMode: TimeMode;
  push: boolean;
  rule: RecurrenceRule | null;
  rrule: string | null;
  skip: string[];
}

export type TimeItem = ReviewItem<AreaValues | SectionValues | ProjectValues | TaskValues>;

export interface TimeExisting {
  areas: { id: string; name: string; archived: boolean; emoji: string | null; color: string; description: string }[];
  sections: { id: string; name: string; areaId: string; archived: boolean; description: string }[];
  projects: {
    id: string;
    name: string;
    archived: boolean;
    areaId: string | null;
    sectionId: string | null;
    description: string;
    start: string | null;
    end: string | null;
    status: string;
    priority: string;
    tags: string[];
  }[];
  tasks: {
    id: string;
    projectId: string | null;
    title: string;
    notes: string;
    type: string;
    status: string;
    quadrant: Quadrant | null;
    priority: string;
    date: string | null;
    allDay: boolean;
    start: number | null;
    end: number | null;
    timeMode: TimeMode | null;
    rrule: string | null;
    tags: string[];
  }[];
}

export interface TimeInput {
  areas?: SheetRows | null;
  sections?: SheetRows | null;
  projects?: SheetRows | null;
  tasks?: SheetRows | null;
  existing: TimeExisting;
  dayFirst?: boolean;
  /** The project "Import tasks" was opened from: tasks without a Project go there. */
  contextProject?: { id: string; name: string } | null;
  /** The person's settings: default time mode per type, and "also push free tasks". */
  defaultMode?: (type: string) => TimeMode;
  includeFree?: boolean;
  defaultMinutes?: number;
}

const TYPE_VALUE: Record<string, string> = { todo: 'ToDo', 'to do': 'ToDo', meeting: 'Meeting', event: 'Event' };
const STATUS_VALUE: Record<string, TaskValues['status']> = { pending: 'Pending', 'to do': 'Pending', todo: 'Pending', done: 'Done', completed: 'Done', complete: 'Done', cancelled: 'Cancelled', canceled: 'Cancelled' };
const PROJECT_STATUS: Record<string, ProjectValues['status']> = { active: 'Active', 'on hold': 'Active', completed: 'Completed', done: 'Completed', archived: 'Archived' };
const QUADRANT_WORD: Record<Quadrant, string> = { do: 'Do first', schedule: 'Schedule', delegate: 'Delegate', eliminate: 'Eliminate' };
const fallbackMode = (type: string): TimeMode => (type === 'Meeting' || type === 'Event' ? 'blocked' : 'free');

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const hhmm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const dayText = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_SHORT[date.getDay()]} ${d} ${MONTH_SHORT[m - 1]} ${y}`;
};
const list = (v: unknown) =>
  cellText(v)
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);

/** A date and time in one cell (the old template): a Date, "05/10/2026 09:00" or "2026-10-05T09:00". */
export function splitDateTime(value: unknown, dayFirst: boolean): { date: string | null; minutes: number | null; invalid: boolean } {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return { date: null, minutes: null, invalid: true };
    const m = value.getHours() * 60 + value.getMinutes();
    return { date: parseDate(value).date, minutes: m === 0 ? null : m, invalid: false };
  }
  if (typeof value === 'number') {
    const date = parseDate(value, dayFirst);
    const frac = Math.round((value % 1) * 1440);
    return { date: date.date, minutes: frac ? frac : null, invalid: date.invalid };
  }
  const text = cellText(value);
  if (!text) return { date: null, minutes: null, invalid: false };
  const [d, t] = text.split(/[ T]+/, 2);
  const date = parseDate(d, dayFirst);
  const time = t ? parseTime(t) : { minutes: null, invalid: false };
  return { date: date.date, minutes: time.minutes, invalid: date.invalid || time.invalid };
}

/** "Tue 6 Oct 2026, 06:00 to 07:00, blocked" or "Every week on Tue and Thu, 06:00 to 07:00, 20 times, blocked". */
export function describeTask(t: Pick<TaskValues, 'date' | 'allDay' | 'start' | 'end' | 'timeMode' | 'rule'>, repeatText: string): string {
  const parts: string[] = [];
  let ends = '';
  if (t.rule && repeatText) {
    const cut = repeatText.search(/, (\d+ times?|until .*)$/);
    parts.push(cut >= 0 ? repeatText.slice(0, cut) : repeatText);
    ends = cut >= 0 ? repeatText.slice(cut + 2) : '';
    if (t.date) parts.push(`from ${dayText(t.date)}`);
  } else if (t.date) parts.push(dayText(t.date));
  if (t.allDay || t.start === null) parts.push(t.date ? 'all day' : 'no date');
  else parts.push(t.end !== null ? `${hhmm(t.start)} to ${hhmm(t.end)}` : hhmm(t.start));
  if (ends) parts.push(ends);
  if (t.date && !t.allDay && t.start !== null) parts.push(t.timeMode);
  return parts.join(', ');
}

export function buildTimeReview(input: TimeInput): TimeItem[] {
  const { existing, dayFirst = true, contextProject = null, includeFree = false, defaultMinutes = 60 } = input;
  const defaultMode = input.defaultMode ?? fallbackMode;
  const items: TimeItem[] = [];

  const exAreas = byName(existing.areas);
  const exProjects = byName(existing.projects);
  const areaName = (id: string | null) => existing.areas.find((a) => a.id === id)?.name ?? '';
  const sectionName = (id: string | null) => existing.sections.find((s) => s.id === id)?.name ?? '';

  // ---- Areas ----
  const fileAreas = new Map<string, TimeItem>();
  const areaItem = (name: string, rowNumber: number | null, sheet: string): TimeItem => ({
    key: rowNumber === null ? `area:implied:${nameKey(name)}` : `area:${sheet}:${rowNumber}`,
    kind: 'area',
    sheet,
    rowNumber,
    name,
    group: 'Areas',
    values: { name, icon: '', color: '', description: '', archived: null },
    text: '',
    status: 'new',
    problems: [],
    notes: [],
    match: null,
    changes: [],
    decision: 'create',
    decided: true,
    canCreateAnyway: false,
  });
  input.areas?.rows.forEach((row, i) => {
    const m = input.areas!.mapping;
    if (skippedRow(row, m)) return;
    const item = areaItem(cellText(cell(row, m, 'name')), i + 2, input.areas!.sheet);
    const v = item.values as AreaValues;
    v.icon = cellText(cell(row, m, 'icon'));
    v.color = cellText(cell(row, m, 'color'));
    v.description = cellText(cell(row, m, 'description'));
    v.archived = yesNo(cell(row, m, 'archived'), 'Archived', item.problems);
    item.text = [v.description, v.archived ? 'archived' : ''].filter(Boolean).join(', ');
    if (!v.name) item.problems.push('Name is empty');
    else if (fileAreas.has(nameKey(v.name))) sameFile(item, fileAreas.get(nameKey(v.name))!);
    else {
      fileAreas.set(nameKey(v.name), item);
      const hit = exAreas.get(nameKey(v.name));
      if (hit) {
        duplicate(item, hit.id, hit.name, hit.archived);
        diff(item.changes, 'Icon', hit.emoji, v.icon);
        diff(item.changes, 'Color', hit.color, v.color);
        diff(item.changes, 'Description', hit.description, v.description);
        if (v.archived !== null) diff(item.changes, 'Archived', hit.archived, v.archived);
      }
    }
    items.push(item);
  });

  /** The area a name points to: a row of the file, an existing area, or one to create. */
  function resolveArea(name: string, sheet: string): void {
    const k = nameKey(name);
    if (!k || fileAreas.has(k)) return;
    const item = areaItem(name, null, sheet);
    const hit = exAreas.get(k);
    if (hit) {
      item.status = 'linked';
      item.match = { id: hit.id, name: hit.name, archived: hit.archived };
    }
    fileAreas.set(k, item);
    items.push(item);
  }
  const areaIdOf = (name: string): string | null => {
    const it = fileAreas.get(nameKey(name));
    return it?.match && !it.match.sameFile ? it.match.id : null;
  };

  // ---- Sections (a name inside an area) ----
  const fileSections = new Map<string, TimeItem>(); // areaKey|sectionKey
  const existingSection = (area: string, name: string) => {
    const areaId = areaIdOf(area);
    return areaId ? existing.sections.find((s) => s.areaId === areaId && nameKey(s.name) === nameKey(name)) : undefined;
  };
  input.sections?.rows.forEach((row, i) => {
    const m = input.sections!.mapping;
    if (skippedRow(row, m)) return;
    const name = cellText(cell(row, m, 'name'));
    const area = cellText(cell(row, m, 'area'));
    const item: TimeItem = { ...areaItem(name, i + 2, input.sections!.sheet), key: `section:${input.sections!.sheet}:${i + 2}`, kind: 'section', group: area || 'No area' };
    const v: SectionValues = {
      name,
      area,
      icon: cellText(cell(row, m, 'icon')),
      color: cellText(cell(row, m, 'color')),
      description: cellText(cell(row, m, 'description')),
      archived: yesNo(cell(row, m, 'archived'), 'Archived', item.problems),
    };
    item.values = v;
    item.text = [`in ${area || 'no area'}`, v.description].filter(Boolean).join(', ');
    if (!name) item.problems.push('Name is empty');
    if (!area) item.problems.push('Area is empty (a section belongs to an area)');
    if (name && area) {
      resolveArea(area, input.sections!.sheet);
      const k = `${nameKey(area)}|${nameKey(name)}`;
      if (fileSections.has(k)) sameFile(item, fileSections.get(k)!);
      else {
        fileSections.set(k, item);
        const hit = existingSection(area, name);
        if (hit) {
          duplicate(item, hit.id, hit.name, hit.archived);
          diff(item.changes, 'Description', hit.description, v.description);
          if (v.archived !== null) diff(item.changes, 'Archived', hit.archived, v.archived);
        }
      }
    }
    items.push(item);
  });

  // ---- Projects ----
  const fileProjects = new Map<string, TimeItem>();
  const projectItem = (name: string, rowNumber: number | null, sheet: string): TimeItem => ({
    ...areaItem(name, rowNumber, sheet),
    key: rowNumber === null ? `project:implied:${nameKey(name)}` : `project:${sheet}:${rowNumber}`,
    kind: 'project',
    group: 'Projects',
    values: { name, area: '', section: '', color: '', priority: null, start: null, end: null, status: null, description: '', tags: [] } as ProjectValues,
  });
  input.projects?.rows.forEach((row, i) => {
    const m = input.projects!.mapping;
    if (skippedRow(row, m)) return;
    const name = cellText(cell(row, m, 'name'));
    const item = projectItem(name, i + 2, input.projects!.sheet);
    const p = item.problems;
    const start = parseDate(cell(row, m, 'start'), dayFirst);
    const end = parseDate(cell(row, m, 'end'), dayFirst);
    const deadline = parseDate(cell(row, m, 'deadline'), dayFirst);
    if (start.invalid) p.push('Start date is not a date (use dd/mm/yyyy)');
    if (end.invalid) p.push('End date is not a date (use dd/mm/yyyy)');
    if (deadline.invalid) p.push('Deadline is not a date (use dd/mm/yyyy)');
    if (end.date && deadline.date && end.date !== deadline.date) item.notes.push('End date and Deadline differ; the End date is used');
    const statusText = nameKey(cell(row, m, 'status'));
    const status = statusText ? (PROJECT_STATUS[statusText] ?? null) : null;
    if (statusText && !status) p.push(`Status must be Active, Completed or Archived, not "${cellText(cell(row, m, 'status'))}"`);
    const v: ProjectValues = {
      name,
      area: cellText(cell(row, m, 'area')),
      section: cellText(cell(row, m, 'section')),
      color: cellText(cell(row, m, 'color')),
      priority: oneOf(cell(row, m, 'priority'), TIME_OPTIONS.priorities, 'Priority', p),
      start: start.date,
      end: end.date ?? deadline.date,
      status,
      description: cellText(cell(row, m, 'description')),
      tags: list(cell(row, m, 'tags')),
    };
    if (v.start && v.end && v.end < v.start) p.push('End date is before the start date');
    item.values = v;
    item.group = v.area || 'No area';
    item.text = [v.section ? `${v.area} / ${v.section}` : v.area, v.end ? `until ${dayText(v.end)}` : '', v.status ?? ''].filter(Boolean).join(', ');
    if (!name) p.push('Name is empty');
    if (v.area) resolveArea(v.area, input.projects!.sheet);
    if (v.section) linkSection(item, v, input.projects!.sheet);
    if (name) {
      const k = nameKey(name);
      if (fileProjects.has(k)) sameFile(item, fileProjects.get(k)!);
      else {
        fileProjects.set(k, item);
        const hit = exProjects.get(k);
        if (hit) {
          duplicate(item, hit.id, hit.name, hit.archived);
          diff(item.changes, 'Area', areaName(hit.areaId), v.area);
          diff(item.changes, 'Section', sectionName(hit.sectionId), v.section);
          diff(item.changes, 'Priority', hit.priority, v.priority);
          diff(item.changes, 'Start date', hit.start, v.start);
          diff(item.changes, 'End date', hit.end, v.end);
          diff(item.changes, 'Status', hit.status, hit.archived && !v.status ? 'Active' : v.status);
          diff(item.changes, 'Description', hit.description, v.description);
          diff(item.changes, 'Tags', hit.tags, v.tags);
        }
      }
    }
    items.push(item);
  });

  /** A project's section: inside its area; a new name is created there (it needs the area). */
  function linkSection(item: TimeItem, v: ProjectValues, sheet: string) {
    let area = v.area;
    if (!area) {
      // A section named alone: the one area that has it.
      const inFile = [...fileSections.values()].filter((s) => nameKey(s.name) === nameKey(v.section));
      const known = existing.sections.filter((s) => nameKey(s.name) === nameKey(v.section) && !s.id.startsWith('default-'));
      const areas = new Set([...inFile.map((s) => nameKey((s.values as SectionValues).area)), ...known.map((s) => nameKey(areaName(s.areaId)))]);
      if (areas.size === 1) {
        area = inFile[0] ? (inFile[0].values as SectionValues).area : areaName(known[0].areaId);
        v.area = area;
        resolveArea(area, sheet);
      } else {
        item.problems.push(areas.size ? `Section "${v.section}" is in more than one area; fill in Area` : `Section "${v.section}" needs an Area`);
        return;
      }
    }
    const k = `${nameKey(area)}|${nameKey(v.section)}`;
    if (fileSections.has(k)) return;
    const s: TimeItem = { ...areaItem(v.section, null, sheet), key: `section:implied:${k}`, kind: 'section', group: area, values: { name: v.section, area, icon: '', color: '', description: '', archived: null } as SectionValues };
    const hit = existingSection(area, v.section);
    if (hit) {
      s.status = 'linked';
      s.match = { id: hit.id, name: hit.name, archived: hit.archived };
    }
    s.text = `in ${area}`;
    fileSections.set(k, s);
    items.push(s);
  }

  // ---- Tasks ----
  const fileTasks = new Map<string, TimeItem>();
  const projectIdOf = (name: string): string | null => {
    if (contextProject && nameKey(contextProject.name) === nameKey(name)) return contextProject.id;
    const it = fileProjects.get(nameKey(name));
    return it?.match && !it.match.sameFile ? it.match.id : null;
  };
  input.tasks?.rows.forEach((row, i) => {
    const m = input.tasks!.mapping;
    if (skippedRow(row, m)) return;
    const sheet = input.tasks!.sheet;
    const p: string[] = [];
    const notes: string[] = [];
    const get = (k: string) => cell(row, m, k);
    const old = Object.values(m).includes('legacyDue') || Object.values(m).includes('legacyStart');

    // When
    let date: string | null = null;
    let start: number | null = null;
    let end: number | null = null;
    if (old) {
      const s = splitDateTime(get('legacyStart'), dayFirst);
      const d = splitDateTime(get('legacyDue'), dayFirst);
      if (s.invalid) p.push('Start Time is not a date and time');
      if (d.invalid) p.push('Due Date is not a date and time');
      date = s.date ?? d.date;
      start = s.minutes;
      end = d.date === date ? d.minutes : null;
      if (start === null && end !== null) [start, end] = [end, null];
    }
    const dateCell = parseDate(get('date'), dayFirst);
    if (dateCell.invalid) p.push('Date is not a date (use dd/mm/yyyy)');
    date = dateCell.date ?? date;
    const startCell = parseTime(get('start'));
    const endCell = parseTime(get('end'));
    if (startCell.invalid) p.push('Start time is not a time (use HH:MM)');
    if (endCell.invalid) p.push('End time is not a time (use HH:MM)');
    start = startCell.minutes ?? start;
    end = endCell.minutes ?? end;
    const durationText = cellText(get('duration'));
    const duration = durationText ? Number(durationText) : null;
    if (durationText && (!Number.isFinite(duration) || duration! <= 0)) p.push(`Duration must be a number of minutes, not "${durationText}"`);
    else if (duration && start !== null) {
      if (end === null) end = start + duration;
      else if (end - start !== duration) notes.push(`End time and Duration disagree; End time ${hhmm(end)} is used`);
    } else if (duration && start === null) notes.push('Duration needs a Start time; it is ignored');
    const allDay = yesNo(get('allDay'), 'All day', p) ?? false;
    if (allDay && (start !== null || end !== null)) {
      notes.push('All day is Yes, so the times are ignored');
      start = null;
      end = null;
    }
    if (start !== null && end !== null && end <= start) p.push('End time is before the start time');
    if (start !== null && !date) p.push('A time needs a Date');
    if (start !== null && end === null) end = start + defaultMinutes;

    // What
    const typeText = nameKey(get('type'));
    const type = typeText ? TYPE_VALUE[typeText] : 'ToDo';
    if (!type) p.push(`Type must be Todo, Meeting or Event, not "${cellText(get('type'))}"`);
    const statusText = nameKey(get('status'));
    const status = statusText ? STATUS_VALUE[statusText] : 'Pending';
    if (!status) p.push(`Status must be Pending, Done or Cancelled, not "${cellText(get('status'))}"`);
    const importanceText = cellText(get('importance'));
    const quadrant = parseImportance(importanceText, get('urgent'), get('important'));
    if (importanceText && !quadrant) p.push(`Importance must be Do first, Schedule, Delegate or Eliminate, not "${importanceText}"`);
    const modeText = nameKey(get('timeMode'));
    const modeCell = modeText ? (modeText.startsWith('block') || modeText === 'busy' ? 'blocked' : modeText.startsWith('free') ? 'free' : null) : null;
    if (modeText && !modeCell) p.push(`Time mode must be Blocked or Free, not "${cellText(get('timeMode'))}"`);
    const timeMode: TimeMode = modeCell ?? defaultMode(type ?? 'ToDo');
    const pushCell = yesNo(get('push'), 'Push to Google Calendar', p);
    const push = pushCell ?? (timeMode === 'blocked' || includeFree);

    // Repeats
    const repeat = parseRepeatCells(
      {
        repeats: get('repeats'),
        every: get('every'),
        onDays: get('onDays'),
        monthlyBy: get('monthlyBy'),
        weekOfMonth: get('weekOfMonth'),
        ends: get('ends'),
        endDate: get('endDate'),
        occurrences: get('occurrences'),
        skipDates: get('skipDates'),
        rrule: get('rrule'),
      },
      date,
      dayFirst
    );
    p.push(...repeat.problems);

    const name = cellText(get('name'));
    if (!name) p.push('Name is empty');
    const project = cellText(get('project')) || contextProject?.name || '';
    const v: TaskValues = {
      name,
      project,
      type: type ?? 'ToDo',
      status: status ?? 'Pending',
      quadrant,
      priority: oneOf(get('priority'), TIME_OPTIONS.priorities, 'Priority', p),
      description: cellText(get('description')),
      tags: list(get('tags')),
      subtasks: parseSubtasks(get('subtasks')),
      date,
      allDay: allDay || (date !== null && start === null),
      start,
      end,
      timeMode,
      push,
      rule: repeat.rule,
      rrule: repeat.rrule,
      skip: repeat.skip,
    };
    const item: TimeItem = {
      key: `task:${sheet}:${i + 2}`,
      kind: 'task',
      sheet,
      rowNumber: i + 2,
      name,
      group: project || 'No project',
      values: v,
      text: describeTask(v, repeat.text),
      status: 'new',
      problems: p,
      notes,
      match: null,
      changes: [],
      decision: 'create',
      decided: true,
      canCreateAnyway: true,
      repeating: Boolean(repeat.rule),
    };

    // The project it names: a row, an existing one (linked), or one to create.
    if (project && !fileProjects.has(nameKey(project)) && !(contextProject && nameKey(contextProject.name) === nameKey(project))) {
      const pi = projectItem(project, null, sheet);
      const hit = exProjects.get(nameKey(project));
      if (hit) {
        pi.status = 'linked';
        pi.match = { id: hit.id, name: hit.name, archived: hit.archived };
      }
      fileProjects.set(nameKey(project), pi);
      items.push(pi);
    }
    if (name) {
      const k = `${nameKey(project)}|${nameKey(name)}`;
      if (fileTasks.has(k)) sameFile(item, fileTasks.get(k)!);
      else {
        fileTasks.set(k, item);
        const pid = project ? projectIdOf(project) : null;
        const hit = project && !pid ? undefined : existing.tasks.find((t) => (t.projectId ?? null) === pid && nameKey(t.title) === nameKey(name));
        if (hit) {
          duplicate(item, hit.id, hit.title, false);
          const c = item.changes;
          diff(c, 'Description', hit.notes, v.description);
          if (cellText(get('type'))) diff(c, 'Type', hit.type, v.type);
          if (cellText(get('status'))) diff(c, 'Status', hit.status, v.status);
          diff(c, 'Importance', hit.quadrant ? QUADRANT_WORD[hit.quadrant] : null, v.quadrant ? QUADRANT_WORD[v.quadrant] : null);
          diff(c, 'Priority', hit.priority, v.priority);
          diff(c, 'Date', hit.date ? dayText(hit.date) : null, v.date ? dayText(v.date) : null);
          if (v.start !== null) {
            diff(c, 'Start time', hhmm(hit.start), hhmm(v.start));
            diff(c, 'End time', hhmm(hit.end), hhmm(v.end));
          }
          if (cellText(get('allDay'))) diff(c, 'All day', hit.allDay, v.allDay);
          if (modeCell) diff(c, 'Time mode', cap(hit.timeMode ?? defaultMode(hit.type)), cap(v.timeMode));
          if (v.rrule !== (hit.rrule ?? null) && (cellText(get('repeats')) || cellText(get('rrule')))) c.push({ field: 'Repeats', from: hit.rrule ? 'repeating' : 'none', to: repeat.text || 'none' });
          diff(c, 'Tags', hit.tags, v.tags);
        }
      }
    }
    items.push(item);
  });

  return settle(items);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sameFile(item: TimeItem, first: TimeItem) {
  item.status = 'duplicate';
  item.match = { id: first.key, name: first.name, sameFile: true };
  item.notes.push(first.rowNumber ? `Same as row ${first.rowNumber} of ${first.sheet}` : 'Same as a name used earlier in the file');
}

function duplicate(item: TimeItem, id: string, name: string, archived: boolean) {
  item.status = 'duplicate';
  item.match = { id, name, archived };
}

/** Did a repeat change in an update (the person picks This and future, or All occurrences)? */
export function changesRepeat(changes: Change[]): boolean {
  return changes.some((c) => c.field === 'Repeats');
}
