'use client';

// Review and select (owner, 24 Nov 2026): the file's tasks in one flat
// table, one row per row of the file, each with a tick. Area, Folder,
// Project and Task are required: an empty one is outlined and typed in
// place (existing names offered; a new name shows "New"). "Put in…" sets
// Area, Folder and Project for every ticked row that needs a look. Sorting
// and grouping change the view only. Below 600px the table is a list and a
// row opens in a sheet.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { RowCheck, TaskImport } from '@/src/logic/importData/useTaskImport';
import type { Node, PlannedTask, TaskListField } from '@/src/shared/import/taskList';
import { Modal } from '@/src/widgets/Modal/Modal';
import { plural, useNarrow, useRowWindow } from './parts';
import s from './ImportFlow.module.css';

export type ReviewFilter = 'all' | 'selected' | 'look' | 'duplicate' | 'clash' | 'left-out';
type SortKey = 'row' | 'task' | 'area' | 'folder' | 'project' | 'due' | 'time' | 'priority' | 'status' | 'check';
type Group = 'none' | 'area' | 'project';

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'selected', label: 'Selected' },
  { key: 'look', label: 'Needs a look' },
  { key: 'duplicate', label: 'Duplicates' },
  { key: 'clash', label: 'Time clashes' },
];
const CHECK_TEXT: Record<RowCheck, string> = { ready: 'Ready', look: 'Needs a look', duplicate: 'Duplicate', clash: 'Time clash' };
const STATUS_TEXT: Record<string, string> = { Pending: 'To do', Stuck: 'Stuck', 'In Review': 'In review', Done: 'Done', Cancelled: 'Cancelled' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (iso: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const hhmm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const timeText = (t: PlannedTask) => (t.start === null ? '' : `${hhmm(t.start)}${t.end !== null ? ` to ${hhmm(t.end)}` : ''}`);
const PLACES = ['area', 'folder', 'project'] as const;
type Place = (typeof PLACES)[number];
const MISSING_WORD: Record<Place | 'task', string> = { area: 'No area', folder: 'No folder', project: 'No project', task: 'No title' };

export function ImportReviewTable({ v, filter, setFilter }: { v: TaskImport; filter: ReviewFilter; setFilter: (f: ReviewFilter) => void }) {
  const plan = v.plan!;
  const narrow = useNarrow();
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: 'row', up: true });
  const [group, setGroup] = useState<Group>('none');
  const [open, setOpen] = useState<number | null>(null);
  const [putting, setPutting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const nodeOf = (key: string | null): Node | null => (key ? (plan.known[key] ?? null) : null);
  const keyOf = (t: PlannedTask, f: Place) => (f === 'area' ? t.areaKey : f === 'folder' ? t.folderKey : t.projectKey);
  const nameOf = (t: PlannedTask, f: Place) => nodeOf(keyOf(t, f))?.name ?? v.textOf(t.index, f);

  const tickable = plan.tasks.filter((t) => !t.problems.length);
  const selected = plan.tasks.filter((t) => t.include).length;
  const lookTicked = plan.tasks.filter((t) => t.ticked && t.problems.length);

  const shown = useMemo(() => {
    const pass = (t: PlannedTask) => {
      const c = v.checkOf(t);
      if (filter === 'selected') return t.include;
      if (filter === 'look') return c === 'look';
      if (filter === 'duplicate') return c === 'duplicate';
      if (filter === 'clash') return c === 'clash';
      if (filter === 'left-out') return !t.include;
      return true;
    };
    const value = (t: PlannedTask): string | number => {
      switch (sort.key) {
        case 'task':
          return t.title.toLowerCase();
        case 'area':
        case 'folder':
        case 'project':
          return nameOf(t, sort.key).toLowerCase();
        case 'due':
          return t.due ?? '9999';
        case 'time':
          return t.start ?? 9999;
        case 'priority':
          return t.priority ?? '';
        case 'status':
          return t.status ?? '';
        case 'check':
          return v.checkOf(t);
        default:
          return t.rowNumber;
      }
    };
    const list = plan.tasks.filter(pass);
    list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : a.rowNumber - b.rowNumber) * (sort.up ? 1 : -1);
    });
    return list;
    // nameOf and checkOf read the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, filter, sort, v.conflicts]);

  type Entry = { kind: 'group'; key: string; label: string; rows: PlannedTask[] } | { kind: 'row'; t: PlannedTask };
  const entries: Entry[] = useMemo(() => {
    if (group === 'none') return shown.map((t) => ({ kind: 'row' as const, t }));
    const groups = new Map<string, PlannedTask[]>();
    for (const t of shown) {
      const label = group === 'area' ? nameOf(t, 'area') || MISSING_WORD.area : [nameOf(t, 'area'), nameOf(t, 'folder'), nameOf(t, 'project')].map((x, i) => x || MISSING_WORD[PLACES[i]]).join(' / ');
      groups.set(label, [...(groups.get(label) ?? []), t]);
    }
    return [...groups].flatMap(([label, rows]) => [{ kind: 'group' as const, key: label, label, rows }, ...rows.map((t) => ({ kind: 'row' as const, t }))]);
    // nameOf reads the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, group]);

  const rowH = narrow ? 64 : 44;
  const win = useRowWindow(entries.length, rowH, scroller, narrow ? 0 : 44);
  const filledArea = plan.tasks.some((t) => t.filled.includes('area')) && v.context?.area?.name;
  const allTicked = tickable.length > 0 && tickable.every((t) => t.ticked);

  const head = (key: SortKey, label: string, className?: string) => (
    <div className={className} role="columnheader" aria-sort={sort.key === key ? (sort.up ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={s.sort} onClick={() => setSort((x) => ({ key, up: x.key === key ? !x.up : true }))}>
        {label}
        {sort.key === key && (sort.up ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </div>
  );

  return (
    <div className={s.flow}>
      <div className={s.bar} role="status">
        <span>
          <strong>{selected.toLocaleString('en-GB')}</strong> of {plan.counts.rows.toLocaleString('en-GB')} selected
        </span>
        <button type="button" className={s.linkButton} onClick={() => v.tick(tickable.map((t) => t.index), true)}>
          Select all {tickable.length.toLocaleString('en-GB')}
        </button>
        <button type="button" className={s.linkButton} onClick={() => v.tick(plan.tasks.map((t) => t.index), false)}>
          Clear
        </button>
        {lookTicked.length > 0 && (
          <button type="button" className={`${s.button} ${s.small}`} onClick={() => setPutting(true)}>
            Put in… ({lookTicked.length})
          </button>
        )}
        {filledArea && <span className={s.muted}>Blank areas filled with {filledArea}</span>}
      </div>

      <div className={s.controls}>
        <div className={s.chips} role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={s.chip} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
          {filter === 'left-out' && (
            <button type="button" className={s.chip} aria-pressed onClick={() => setFilter('all')}>
              Not imported
            </button>
          )}
        </div>
        <label className={s.row}>
          <span className={s.muted}>Group</span>
          <select className={s.select} value={group} onChange={(e) => setGroup(e.target.value as Group)}>
            <option value="none">No grouping</option>
            <option value="area">By area</option>
            <option value="project">By project</option>
          </select>
        </label>
      </div>

      <div ref={scroller} className={s.scroll} data-virtual={win.virtual || undefined}>
        <div className={s.table} role="table" aria-label="Tasks in the file" aria-rowcount={entries.length + 1} style={{ ['--row-h' as string]: `${rowH}px` }}>
          <div className={`${s.tr} ${s.th}`} role="row">
            <div className={s.stick1} role="columnheader">
              <label className={s.checkHit}>
                <input
                  type="checkbox"
                  className={s.check}
                  checked={allTicked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allTicked && selected > 0;
                  }}
                  onChange={(e) => v.tick(tickable.map((t) => t.index), e.target.checked)}
                  aria-label="Select all"
                />
              </label>
            </div>
            {head('task', 'Task', s.stick2)}
            {head('area', 'Area')}
            {head('folder', 'Folder')}
            {head('project', 'Project')}
            {head('due', 'Due')}
            {head('time', 'Time')}
            {head('priority', 'Priority')}
            {head('status', 'Status')}
            {head('row', 'Row')}
            {head('check', 'Check')}
          </div>
          {win.start > 0 && <div style={{ height: win.start * rowH }} aria-hidden />}
          {entries.slice(win.start, win.end).map((e) =>
            e.kind === 'group' ? (
              <GroupRow key={`g-${e.key}`} label={e.label} rows={e.rows} v={v} />
            ) : (
              <Row key={e.t.index} t={e.t} v={v} nameOf={nameOf} nodeOf={nodeOf} keyOf={keyOf} onOpen={() => setOpen(e.t.index)} lookFilter={filter === 'look'} />
            )
          )}
          {win.end < entries.length && <div style={{ height: (entries.length - win.end) * rowH }} aria-hidden />}
          {entries.length === 0 && <p className={s.empty}>No rows here.</p>}
        </div>
      </div>

      {open !== null && <RowSheet t={plan.tasks.find((t) => t.index === open)!} v={v} onClose={() => setOpen(null)} />}
      {putting && <PutIn v={v} rows={lookTicked} onClose={() => setPutting(false)} />}
    </div>
  );
}

function GroupRow({ label, rows, v }: { label: string; rows: PlannedTask[]; v: TaskImport }) {
  const tickable = rows.filter((t) => !t.problems.length);
  const all = tickable.length > 0 && tickable.every((t) => t.ticked);
  return (
    <div className={`${s.tr} ${s.group}`} role="row">
      <div className={s.stick1} role="cell">
        <label className={s.checkHit}>
          <input type="checkbox" className={s.check} checked={all} disabled={!tickable.length} onChange={(e) => v.tick(tickable.map((t) => t.index), e.target.checked)} aria-label={`Select the tasks in ${label}`} />
        </label>
      </div>
      <div className={s.groupName} role="cell">
        {label} <span className={s.muted}>{plural(rows.length, 'task')}</span>
      </div>
    </div>
  );
}

function Row({
  t,
  v,
  nameOf,
  nodeOf,
  keyOf,
  onOpen,
  lookFilter,
}: {
  t: PlannedTask;
  v: TaskImport;
  nameOf: (t: PlannedTask, f: Place) => string;
  nodeOf: (k: string | null) => Node | null;
  keyOf: (t: PlannedTask, f: Place) => string | null;
  onOpen: () => void;
  lookFilter: boolean;
}) {
  const check = v.checkOf(t);
  const look = check === 'look';
  const clashOpen = check === 'clash' && t.include && !v.conflictChoice[t.index];
  // A row that needs a look is ticked only to "Put in…", from the Needs a look view.
  const canTick = !look || lookFilter;
  const tag = (
    <CheckTag check={check} clashOpen={clashOpen} onOpen={onOpen} />
  );
  const place = (f: Place) => {
    const name = nameOf(t, f);
    if (t.missing.includes(f)) return <MissingCell key={f} t={t} field={f} v={v} />;
    const node = nodeOf(keyOf(t, f));
    return (
      <div key={f} role="cell">
        <span className={s.cellText}>{name}</span>
        {node && !node.existingId && (
          <span className={s.tag} data-tone="new">
            New
          </span>
        )}
      </div>
    );
  };
  const second = (
    <span className={s.second} role="cell">
      {PLACES.map((f, i) => (
        <span key={f}>
          {i > 0 && ' / '}
          {t.missing.includes(f) ? <span className={s.error}>{MISSING_WORD[f]}</span> : nameOf(t, f)}
        </span>
      ))}
      {t.due && ` · ${dayText(t.due)}`}
    </span>
  );
  return (
    <div className={s.tr} role="row">
      <div className={s.stick1} role="cell">
        <label className={s.checkHit} title={canTick ? undefined : 'Fix this row first'}>
          <input
            type="checkbox"
            className={s.check}
            checked={t.ticked && canTick}
            disabled={!canTick}
            onChange={(e) => v.tick([t.index], e.target.checked)}
            aria-label={canTick ? `Import ${t.title || `row ${t.rowNumber}`}` : `Row ${t.rowNumber} needs a look first`}
          />
        </label>
      </div>
      {t.missing.includes('task') ? (
        <MissingCell t={t} field="task" v={v} sticky />
      ) : (
        <div className={s.stick2} role="cell">
          <button type="button" className={s.taskButton} onClick={onOpen}>
            {t.title}
          </button>
        </div>
      )}
      {PLACES.map(place)}
      <div role="cell">{dayText(t.due)}</div>
      <div role="cell">{timeText(t)}</div>
      <div role="cell">{t.priority ?? ''}</div>
      <div role="cell">{t.status ? STATUS_TEXT[t.status] : ''}</div>
      <div role="cell">{t.rowNumber}</div>
      <div role="cell">{tag}</div>
      {second}
      {check !== 'ready' && <span className={s.phoneTag}>{tag}</span>}
    </div>
  );
}

function CheckTag({ check, clashOpen, onOpen }: { check: RowCheck; clashOpen: boolean; onOpen: () => void }) {
  if (check === 'ready')
    return (
      <span className={s.tag} data-tone="ready">
        Ready
      </span>
    );
  return (
    <button type="button" className={s.tag} data-tone={check} onClick={onOpen}>
      {clashOpen ? 'Time clash: choose' : CHECK_TEXT[check]}
    </button>
  );
}

/** The names a missing cell can take: existing ones under the row's own parent. */
function optionsFor(v: TaskImport, t: PlannedTask, field: Place): string[] {
  const plan = v.plan!;
  const area = t.areaKey ? plan.known[t.areaKey] : null;
  const folder = t.folderKey ? plan.known[t.folderKey] : null;
  if (field === 'area') return v.existing.areas.map((a) => a.name);
  if (field === 'folder') return area?.existingId ? v.existing.folders.filter((f) => f.areaId === area.existingId).map((f) => f.name) : ['General'];
  if (!folder?.existingId) return [];
  const isDefault = v.existing.folders.find((f) => f.id === folder.existingId)?.isDefault;
  return v.existing.projects.filter((p) => p.bucketId === folder.existingId || (isDefault && p.bucketId === null && p.areaId === area?.existingId)).map((p) => p.name);
}

const PROMPT: Record<Place | 'task', string> = {
  area: 'Which area is this in?',
  folder: 'Which folder is this in?',
  project: 'Which project is this in?',
  task: 'What is the task called?',
};

function MissingCell({ t, field, v, sticky }: { t: PlannedTask; field: Place | 'task'; v: TaskImport; sticky?: boolean }) {
  const id = `opts-${t.index}-${field}`;
  const options = field === 'task' ? [] : optionsFor(v, t, field);
  return (
    <div className={`${s.cellMissing} ${sticky ? s.stick2 : ''}`} role="cell">
      <input
        className={s.input}
        list={options.length ? id : undefined}
        defaultValue=""
        placeholder={PROMPT[field]}
        aria-label={`${PROMPT[field]} Row ${t.rowNumber}`}
        onBlur={(e) => {
          if (e.target.value.trim()) v.fix(t.index, field, e.target.value.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {options.length > 0 && (
        <datalist id={id}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );
}

const DETAIL_FIELDS: { field: TaskListField; label: string; wide?: boolean }[] = [
  { field: 'task', label: 'Task', wide: true },
  { field: 'area', label: 'Area' },
  { field: 'folder', label: 'Folder' },
  { field: 'project', label: 'Project' },
  { field: 'due', label: 'Due date' },
  { field: 'start', label: 'Start time' },
  { field: 'end', label: 'End time' },
  { field: 'priority', label: 'Priority' },
  { field: 'status', label: 'Status' },
  { field: 'repeats', label: 'Repeats' },
  { field: 'notes', label: 'Notes', wide: true },
  { field: 'subtasks', label: 'Subtasks', wide: true },
  { field: 'tags', label: 'Tags', wide: true },
];

/** A row opened: every field, editable; why it needs a look; a clash's choice. */
function RowSheet({ t, v, onClose }: { t: PlannedTask; v: TaskImport; onClose: () => void }) {
  const check = v.checkOf(t);
  const choice = v.conflictChoice[t.index];
  return (
    <Modal title={`Row ${t.rowNumber}`} onClose={onClose} sheet>
      <div className={s.detail}>
        {t.problems.length > 0 && (
          <ul className={s.problems}>
            {t.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {t.duplicate && <p className={s.muted}>{t.duplicate === 'existing' ? 'This task is already in Dreda, in the same project on the same day.' : 'An earlier row in the file is the same task.'} It is left out unless you tick it.</p>}
        {check === 'clash' && (
          <div className={s.card}>
            <p className={s.cardTitle}>This time clashes with your calendar</p>
            <div className={s.row}>
              {(
                [
                  ['free', 'Import as free time'],
                  ['unscheduled', 'Import without a time'],
                  ['skip', 'Not at all'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={s.chip}
                  aria-pressed={value === 'skip' ? !t.ticked : t.ticked && choice === value}
                  onClick={() => {
                    v.chooseConflict(t.index, value);
                    if (value !== 'skip') v.tick([t.index], true);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={s.fields}>
          {DETAIL_FIELDS.map(({ field, label, wide }) => (
            <DetailField key={field} t={t} v={v} field={field} label={label} wide={wide} />
          ))}
        </div>
        <button type="button" className={s.primary} onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function DetailField({ t, v, field, label, wide }: { t: PlannedTask; v: TaskImport; field: TaskListField; label: string; wide?: boolean }): ReactNode {
  // A place filled from where the import was opened shows its name.
  const placeKey = field === 'area' ? t.areaKey : field === 'folder' ? t.folderKey : field === 'project' ? t.projectKey : null;
  const value = v.textOf(t.index, field) || (placeKey ? (v.plan!.known[placeKey]?.name ?? '') : '');
  const missing = t.missing.includes(field as Place | 'task');
  return (
    <label className={s.field} data-wide={wide || undefined} data-missing={missing || undefined}>
      {label}
      <input
        className={s.input}
        defaultValue={value}
        onBlur={(e) => {
          if (e.target.value !== value) v.fix(t.index, field, e.target.value);
        }}
      />
    </label>
  );
}

/** "Put in…": one Area, Folder and Project for several rows. */
function PutIn({ v, rows, onClose }: { v: TaskImport; rows: PlannedTask[]; onClose: () => void }) {
  const [area, setArea] = useState(v.context?.area?.name ?? '');
  const [folder, setFolder] = useState('');
  const [project, setProject] = useState('');
  const norm = (x: string) => x.trim().toLowerCase();
  const areaHit = v.existing.areas.find((a) => norm(a.name) === norm(area));
  const folders = areaHit ? v.existing.folders.filter((f) => f.areaId === areaHit.id) : [];
  const folderHit = folders.find((f) => norm(f.name) === norm(folder));
  const projects = folderHit ? v.existing.projects.filter((p) => p.bucketId === folderHit.id || (folderHit.isDefault && p.bucketId === null && p.areaId === areaHit?.id)) : [];
  const ok = area.trim() && folder.trim() && project.trim();
  const field = (label: string, value: string, set: (x: string) => void, options: string[], isNew: boolean) => (
    <label className={s.field}>
      <span>
        {label} {value.trim() && isNew && <span className={s.tag} data-tone="new">New</span>}
      </span>
      <input className={s.input} list={`put-${label}`} value={value} onChange={(e) => set(e.target.value)} placeholder="Choose or type a new name" />
      <datalist id={`put-${label}`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
  return (
    <Modal title={`Put ${plural(rows.length, 'row')} in…`} onClose={onClose} sheet>
      <div className={s.detail}>
        <p className={s.muted}>The folder is looked for inside the area, and the project inside the folder. Anything new is created with the first of these tasks.</p>
        <div className={s.fields}>
          {field('Area', area, setArea, v.existing.areas.map((a) => a.name), !areaHit)}
          {field('Folder', folder, setFolder, areaHit ? folders.map((f) => f.name) : ['General'], !folderHit)}
          {field('Project', project, setProject, projects.map((p) => p.name), !projects.some((p) => norm(p.name) === norm(project)))}
        </div>
        <button
          type="button"
          className={s.primary}
          disabled={!ok}
          onClick={() => {
            v.putIn(rows.map((r) => r.index), { area: area.trim(), folder: folder.trim(), project: project.trim() });
            onClose();
          }}
        >
          Put {plural(rows.length, 'row')} here
        </button>
      </div>
    </Modal>
  );
}
