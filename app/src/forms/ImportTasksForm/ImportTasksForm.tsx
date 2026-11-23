'use client';

// Import tasks (owner, 23 Nov 2026): one task list, one template. One form
// for web and phone (FormChrome: a side peek on wide screens, full-screen
// pages on a phone), its steps replacing one another. The logic is
// useTaskImport.
//   1. Upload: a drop zone (on a phone, "Choose file") and the template.
//   2. Columns: only when the headers aren't the template's. Each column,
//      three samples and the field it fills.
//   3. Check: the summary sentence, the date reading, "Did you mean",
//      problem rows (fixed in place), then the tree: Area, Folder, Project
//      and their tasks, "New" on what will be created.
// Then progress, and Done with links, the report and Undo.

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Inbox, Upload } from 'lucide-react';
import { useTaskImport, type ImportStep, type TaskImport } from '@/src/logic/importData/useTaskImport';
import { TASK_LIST_FIELDS, samples, type PlannedTask, type TaskListField } from '@/src/shared/import/taskList';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useSubmitState } from '@/src/shared/hooks/useSubmitState';
import { FormChrome } from '@/src/widgets/FormFrame/FormFrame';
import styles from './ImportTasksForm.module.css';

const STEP_TITLE: Record<ImportStep, string> = {
  upload: 'Import tasks',
  columns: 'Match columns',
  check: 'Check',
  importing: 'Importing',
  done: 'Import finished',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (iso: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const hhmm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

export function ImportTasksForm({
  areaId = null,
  projectId = null,
  reportId = null,
  onClose,
  restoreHref,
}: {
  areaId?: string | null;
  projectId?: string | null;
  /** An earlier import's report to show (the notification's link). */
  reportId?: string | null;
  onClose: () => void;
  restoreHref?: string;
}) {
  const v = useTaskImport({ areaId, projectId });
  const [openedReport, setOpenedReport] = useState(false);
  if (reportId && !openedReport) {
    setOpenedReport(true);
    void v.openLog(reportId);
  }
  const where = v.context?.project?.name ?? v.context?.area?.name;
  const title = v.step === 'upload' && where ? `Import tasks into ${where}` : STEP_TITLE[v.step];
  return (
    <FormChrome title={title} onClose={onClose} phoneHeader="bar" context={v.fileName ?? undefined}>
      {v.error && (
        <p className={styles.error} role="alert">
          {v.error}
        </p>
      )}
      {v.step === 'upload' && <UploadStep v={v} restoreHref={restoreHref} />}
      {v.step === 'columns' && <ColumnsStep v={v} />}
      {v.step === 'check' && <CheckStep v={v} />}
      {v.step === 'importing' && (
        <p className={styles.progress} aria-live="polite">
          Importing… {v.progress.done.toLocaleString('en-US')} of {v.progress.total.toLocaleString('en-US')}
        </p>
      )}
      {v.step === 'done' && <DoneStep v={v} onClose={onClose} />}
    </FormChrome>
  );
}

function Primary({ label, disabled, onSubmit }: { label: string; disabled?: boolean; onSubmit: () => unknown }) {
  // Locked while the step's work runs: a double click imports once.
  const { phase, run } = useSubmitState();
  return (
    <form
      className={styles.footer}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!disabled && phase === 'idle') void run(onSubmit).catch(() => undefined);
      }}
    >
      <button type="submit" className={styles.primary} disabled={disabled || phase !== 'idle'} aria-busy={phase === 'saving' || undefined}>
        {phase === 'saving' ? 'Working…' : label}
      </button>
    </form>
  );
}

function UploadStep({ v, restoreHref }: { v: TaskImport; restoreHref?: string }) {
  const { isWide } = useLayout();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className={styles.stack}>
      <button
        type="button"
        className={styles.drop}
        data-dragging={dragging || undefined}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void v.handleFile(file);
        }}
      >
        <Upload size={22} strokeWidth={2} aria-hidden />
        <span className={styles.dropTitle}>{isWide ? 'Drop your task list here, or choose a file' : 'Choose file'}</span>
        <span className={styles.hint}>.xlsx, .xls or .csv, one task per row, up to 2,000 rows. A sheet called Tasks is used first.</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void v.handleFile(file);
          e.target.value = '';
        }}
      />

      <div className={styles.card}>
        <span className={styles.label}>Task list template</span>
        <p className={styles.hint}>One sheet of tasks. Each row says its Area, Folder and Project; anything new is created for you. It also lists your current areas, folders and projects.</p>
        <button type="button" className={styles.templateRow} onClick={() => v.downloadTemplate('xlsx')}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> Download the task list template (.xlsx)
        </button>
        <button type="button" className={styles.templateRow} onClick={() => v.downloadTemplate('csv')}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> As a .csv file
        </button>
      </div>

      {restoreHref && (
        <p className={styles.hint}>
          Restoring a full Dreda export (money and everything)? <Link href={restoreHref}>Restore a backup</Link>
        </p>
      )}
    </div>
  );
}

function ColumnsStep({ v }: { v: TaskImport }) {
  return (
    <div className={styles.stack}>
      <p className={styles.hint}>Which field does each column fill? Columns named like the template are already chosen. Your choices are remembered for next time.</p>
      {v.headers.map((h) => (
        <div key={h} className={styles.columnRow}>
          <span className={styles.columnText}>
            <strong>{h}</strong>
            <span className={styles.hint}>{samples(v.rows, h).join(' · ') || 'Empty'}</span>
          </span>
          <select className={styles.select} value={v.mapping[h] ?? 'ignore'} onChange={(e) => v.setColumn(h, e.target.value as TaskListField | 'ignore')} aria-label={`Field for ${h}`}>
            <option value="ignore">Ignore</option>
            {TASK_LIST_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Primary label="Continue" disabled={!Object.values(v.mapping).includes('task')} onSubmit={() => v.confirmColumns()} />
    </div>
  );
}

function CheckStep({ v }: { v: TaskImport }) {
  const plan = v.plan;
  if (!plan) return null;
  const problems = plan.tasks.filter((t) => t.problems.length > 0);
  const fromContext = plan.tasks.some((t) => t.fromContext);
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <span className={styles.label}>Summary</span>
        <p className={styles.summary}>{v.sentence}</p>
        {fromContext && v.context?.area && (
          <p className={styles.hint}>
            Rows with no area go to {v.context.project ? `${v.context.project.name} (${v.context.area.name})` : v.context.area.name}, where you opened the import.
          </p>
        )}
      </div>

      {v.dueOrder && (v.orderNote || v.dueOrder.conflict) && (
        <div className={styles.card}>
          <span className={styles.label}>Dates</span>
          {v.orderNote && <p className={styles.summary}>{v.orderNote}</p>}
          {v.dueOrder.conflict && <p className={styles.hint}>Some dates in this column can only be day first and others only month first. Those rows are listed below to check.</p>}
          <div className={styles.choices}>
            <button type="button" className={styles.choice} aria-pressed={v.order === 'dmy'} onClick={() => v.setOrder('dmy')}>
              Day first
            </button>
            <button type="button" className={styles.choice} aria-pressed={v.order === 'mdy'} onClick={() => v.setOrder('mdy')}>
              Month first
            </button>
          </div>
        </div>
      )}

      {plan.questions.map((q) => (
        <div key={q.key} className={styles.card} data-attention={!q.answer || undefined}>
          <span className={styles.label}>Did you mean {q.existing.name}?</span>
          <p className={styles.hint}>
            The file says “{q.name}”{q.parentName ? ` in ${q.parentName}` : ''}. There is already a {q.kind} called “{q.existing.name}”. This applies to every row with that name.
          </p>
          <div className={styles.choices}>
            <button type="button" className={styles.choice} aria-pressed={q.answer === 'existing'} onClick={() => v.answer(q.key, 'existing')}>
              Use existing
            </button>
            <button type="button" className={styles.choice} aria-pressed={q.answer === 'new'} onClick={() => v.answer(q.key, 'new')}>
              Create new
            </button>
          </div>
        </div>
      ))}

      {problems.length > 0 && (
        <section className={styles.group} aria-label="Rows that need a look">
          <h3 className={styles.groupTitle}>Rows that need a look · {problems.length}</h3>
          {problems.map((t) => (
            <ProblemRow key={t.index} t={t} v={v} />
          ))}
        </section>
      )}

      {v.conflictsOpen > 0 && <p className={styles.error}>{v.conflictsOpen === 1 ? 'One timed task clashes' : `${v.conflictsOpen} timed tasks clash`} with your calendar. Choose what to do with each below.</p>}

      <Tree v={v} />

      <Primary label={`Import ${plan.counts.tasks} ${plan.counts.tasks === 1 ? 'task' : 'tasks'}`} disabled={!plan.ready || v.conflictsOpen > 0} onSubmit={() => v.runImport()} />
    </div>
  );
}

const EDITABLE: TaskListField[] = ['area', 'folder', 'project', 'task', 'due', 'start', 'end', 'priority', 'status', 'repeats'];

function ProblemRow({ t, v }: { t: PlannedTask; v: TaskImport }) {
  // The cells the problem is about, editable in place.
  const fields = EDITABLE.filter((f) => {
    const p = t.problems.join(' ').toLowerCase();
    if (f === 'area') return p.includes('which area');
    if (f === 'task') return p.includes('no title');
    if (f === 'due') return p.includes('date') || p.includes('day and month');
    if (f === 'start' || f === 'end') return p.includes('time');
    return p.includes(f);
  });
  const raw = (f: TaskListField) => {
    const col = Object.keys(v.mapping).find((h) => v.mapping[h] === f);
    return col ? String(v.rows[t.index]?.[col] ?? '') : '';
  };
  return (
    <div className={styles.item} data-attention>
      <span className={styles.itemTop}>
        <span className={styles.itemName}>
          Row {t.rowNumber}: {t.title || 'No title'}
        </span>
      </span>
      <span className={styles.note}>{t.problems.join(' ')}</span>
      <div className={styles.fixer}>
        {fields.map((f) => (
          <label key={f} className={styles.pickRow}>
            {TASK_LIST_FIELDS.find((x) => x.key === f)!.label}
            <input
              className={styles.select}
              defaultValue={raw(f)}
              onBlur={(e) => {
                if (e.target.value !== raw(f)) v.fix(t.index, f, e.target.value);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Tree({ v }: { v: TaskImport }) {
  const plan = v.plan!;
  const rows = plan.tasks.filter((t) => !t.problems.length);
  const newTag = (n: { existingId: string | null } | null) => (n && !n.existingId ? <span className={styles.status} data-status="new">New</span> : null);
  const inbox = rows.filter((t) => !t.projectKey);
  return (
    <div className={styles.stack}>
      {plan.areas.map((a) => (
        <section key={a.key} className={styles.group} aria-label={a.name}>
          <h3 className={styles.groupTitle}>
            {a.name} {newTag(a)}
          </h3>
          {plan.folders
            .filter((f) => f.parentKey === a.key)
            .map((f) => (
              <div key={f.key} className={styles.card}>
                <span className={styles.label}>
                  {f.name} {f.isDefault ? null : newTag(f)}
                </span>
                {plan.projects
                  .filter((p) => p.parentKey === f.key)
                  .map((p) => (
                    <div key={p.key} className={styles.list}>
                      <strong className={styles.itemName}>
                        {p.name} {newTag(p)}
                      </strong>
                      {rows
                        .filter((t) => t.projectKey === p.key)
                        .map((t) => (
                          <TaskLine key={t.index} t={t} v={v} />
                        ))}
                    </div>
                  ))}
              </div>
            ))}
        </section>
      ))}
      {inbox.length > 0 && (
        <section className={styles.group} aria-label="Inbox">
          <h3 className={styles.groupTitle}>
            <Inbox size={16} strokeWidth={2} aria-hidden /> Inbox
          </h3>
          <div className={styles.card}>
            {inbox.map((t) => (
              <TaskLine key={t.index} t={t} v={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TaskLine({ t, v }: { t: PlannedTask; v: TaskImport }) {
  const conflict = v.conflicts.has(t.index);
  const choice = v.conflictChoice[t.index];
  const when = [dayText(t.due), t.start !== null ? `${hhmm(t.start)}${t.end !== null ? ` to ${hhmm(t.end)}` : ''}` : ''].filter(Boolean).join(', ');
  return (
    <div className={styles.item} data-attention={(conflict && !choice) || undefined}>
      <span className={styles.itemTop}>
        <span className={styles.itemName} data-off={!t.include || undefined}>
          {t.title}
        </span>
        {t.duplicate && (
          <span className={styles.status} data-status="duplicate">
            {t.duplicate === 'existing' ? 'Already in Dreda' : 'Repeated in the file'}
          </span>
        )}
        {conflict && (
          <span className={styles.status} data-status="problem">
            Time conflict
          </span>
        )}
      </span>
      {when && <span className={styles.hint}>{when}</span>}
      {t.duplicate && (
        <label className={styles.pickRow}>
          <input type="checkbox" checked={t.include} onChange={(e) => v.toggleDuplicate(t.index, e.target.checked)} /> Import it anyway
        </label>
      )}
      {conflict && t.include && (
        <div className={styles.choices}>
          {(
            [
              ['free', 'Import as free time'],
              ['unscheduled', 'Import without a time'],
              ['skip', 'Skip it'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={styles.choice} aria-pressed={choice === value} onClick={() => v.chooseConflict(t.index, value)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DoneStep({ v, onClose }: { v: TaskImport; onClose: () => void }) {
  const log = v.log;
  const tasks = log?.created.tasks.length ?? 0;
  const projects = log?.projects ?? [];
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <span className={styles.label}>{log?.undoneAt ? 'Undone' : 'Imported'}</span>
        <p className={styles.summary}>
          {log?.undoneAt
            ? 'Everything this import created was removed; its areas and folders were archived.'
            : `Imported ${tasks} ${tasks === 1 ? 'task' : 'tasks'}${projects.length ? ` into ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}` : ''}.`}
        </p>
        {!log?.undoneAt &&
          projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={styles.templateRow}>
              {p.name} · {p.count} {p.count === 1 ? 'task' : 'tasks'}
            </Link>
          ))}
      </div>
      {v.plan && (
        <button type="button" className={styles.secondary} onClick={v.downloadReport}>
          Download the report of skipped and problem rows (CSV)
        </button>
      )}
      {v.canUndo && (
        <button type="button" className={styles.secondary} disabled={v.undoing} onClick={() => void v.undo()}>
          {v.undoing ? 'Undoing…' : 'Undo import'}
        </button>
      )}
      <button type="button" className={styles.secondary} onClick={v.reset}>
        Import another file
      </button>
      <Primary label="Done" onSubmit={onClose} />
    </div>
  );
}
