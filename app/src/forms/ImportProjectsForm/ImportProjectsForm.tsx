'use client';

// Import projects and tasks from a spreadsheet: one form for both layouts
// (FormChrome: a side peek on wide screens, full-screen pages on a phone),
// its steps replacing one another. The logic is useProjectImport.
//   1. Upload: a drop zone (on a phone, "Choose file"), templates, and on
//      wide screens rows pasted from a spreadsheet.
//   2. Match columns: each column, three samples and the field it fills.
//   3. Review: a table (a list on a phone) grouped by project, each row's
//      status and the choice for it; areas to create; time conflicts.
//   4. Confirm: the summary and "Import".
// Then progress, and the result with its report and Undo.

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useProjectImport, type ImportStep, type ProjectImport } from '@/src/logic/importData/useProjectImport';
import { PROJECT_FIELDS, TASK_FIELDS, samples, type RowStatus } from '@/src/shared/import/projectTasks';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { FormChrome } from '@/src/widgets/FormFrame/FormFrame';
import styles from './ImportProjectsForm.module.css';

const STATUS_LABEL: Record<RowStatus, string> = { new: 'New', duplicate: 'Duplicate', possible: 'Possible duplicate', problem: 'Problem' };
const STEP_TITLE: Record<ImportStep, string> = {
  upload: 'Import from spreadsheet',
  match: 'Match columns',
  review: 'Review',
  confirm: 'Confirm',
  importing: 'Importing',
  result: 'Import finished',
};
const fmtMinutes = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

export function ImportProjectsForm({
  projectId = null,
  reportId = null,
  onClose,
  restoreHref,
}: {
  projectId?: string | null;
  /** An earlier import's report to show (the notification's link). */
  reportId?: string | null;
  onClose: () => void;
  restoreHref?: string;
}) {
  const v = useProjectImport({ projectId });
  const [openedReport, setOpenedReport] = useState(false);
  if (reportId && !openedReport) {
    setOpenedReport(true);
    void v.openLog(reportId);
  }
  const title = v.step === 'upload' && v.contextProject ? `Import tasks into ${v.contextProject.name}` : STEP_TITLE[v.step];
  return (
    <FormChrome title={title} onClose={onClose} phoneHeader="bar" context={v.fileName ?? undefined}>
      {v.error && (
        <p className={styles.error} role="alert">
          {v.error}
        </p>
      )}
      {v.step === 'upload' && <UploadStep v={v} restoreHref={restoreHref} />}
      {v.step === 'match' && <MatchStep v={v} />}
      {v.step === 'review' && <ReviewStep v={v} />}
      {v.step === 'confirm' && <ConfirmStep v={v} />}
      {v.step === 'importing' && (
        <p className={styles.progress} aria-live="polite">
          Importing… {v.progress.done.toLocaleString('en-US')} of {v.progress.total.toLocaleString('en-US')}
        </p>
      )}
      {v.step === 'result' && <ResultStep v={v} onClose={onClose} />}
    </FormChrome>
  );
}

function Primary({ label, disabled, onSubmit }: { label: string; disabled?: boolean; onSubmit: () => void }) {
  return (
    <form
      className={styles.footer}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <button type="submit" className={styles.primary} disabled={disabled}>
        {label}
      </button>
    </form>
  );
}

function UploadStep({ v, restoreHref }: { v: ProjectImport; restoreHref?: string }) {
  const { isWide } = useLayout();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
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
        <span className={styles.dropTitle}>{isWide ? 'Drop a spreadsheet here, or choose a file' : 'Choose file'}</span>
        <span className={styles.hint}>.xlsx, .xls or .csv, up to 2,000 rows</span>
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

      {isWide && (
        <div className={styles.card}>
          <span className={styles.label}>Or paste rows copied from a spreadsheet</span>
          <textarea className={styles.paste} rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Copy the header row and the rows below it, then paste here" />
          <button type="button" className={styles.secondary} disabled={!pasted.trim()} onClick={() => v.handlePaste(pasted)}>
            Use these rows
          </button>
        </div>
      )}

      <div className={styles.card}>
        <span className={styles.label}>Templates</span>
        <button type="button" className={styles.templateRow} onClick={() => v.downloadTemplate('tasks')}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> Tasks for one project
        </button>
        <button type="button" className={styles.templateRow} onClick={() => v.downloadTemplate('combined')}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> Projects and tasks in one sheet (a Project column)
        </button>
        <button type="button" className={styles.templateRow} onClick={() => v.downloadTemplate('two-sheets')}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> Projects and tasks in two sheets
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

function MatchStep({ v }: { v: ProjectImport }) {
  const sheetOptions = v.sheets.map((s) => s.name);
  const ps = v.sheets.find((s) => s.name === v.projectSheet);
  const ts = v.sheets.find((s) => s.name === v.taskSheet);
  return (
    <div className={styles.stack}>
      {v.sheets.length > 1 && (
        <div className={styles.card}>
          <span className={styles.label}>Sheets</span>
          {!v.contextProject && (
            <label className={styles.pickRow}>
              Projects
              <select className={styles.select} value={v.projectSheet ?? ''} onChange={(e) => v.setProjectSheet(e.target.value || null)}>
                <option value="">None</option>
                {sheetOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.pickRow}>
            Tasks
            <select className={styles.select} value={v.taskSheet ?? ''} onChange={(e) => v.setTaskSheet(e.target.value || null)}>
              <option value="">None</option>
              {sheetOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className={styles.card}>
        <span className={styles.label}>Dates are written</span>
        <span className={styles.segmented} role="radiogroup" aria-label="Date order">
          <button type="button" role="radio" aria-checked={v.dayFirst} onClick={() => v.setDayFirst(true)}>
            Day first (31/12/2026)
          </button>
          <button type="button" role="radio" aria-checked={!v.dayFirst} onClick={() => v.setDayFirst(false)}>
            Month first (12/31/2026)
          </button>
        </span>
      </div>

      {ps && (
        <ColumnList
          title={`Projects (${ps.name})`}
          headers={ps.headers}
          rows={ps.rows}
          fields={PROJECT_FIELDS}
          mapping={v.projectMap as Record<string, string>}
          onChange={(h, f) => v.setProjectMap({ ...v.projectMap, [h]: f as never })}
        />
      )}
      {ts && (
        <ColumnList
          title={`Tasks (${ts.name})`}
          headers={ts.headers}
          rows={ts.rows}
          fields={TASK_FIELDS}
          mapping={v.taskMap as Record<string, string>}
          onChange={(h, f) => v.setTaskMap({ ...v.taskMap, [h]: f as never })}
        />
      )}

      <Primary label="Review rows" onSubmit={v.confirmMapping} />
    </div>
  );
}

function ColumnList({
  title,
  headers,
  rows,
  fields,
  mapping,
  onChange,
}: {
  title: string;
  headers: string[];
  rows: Record<string, unknown>[];
  fields: { key: string; label: string }[];
  mapping: Record<string, string>;
  onChange: (header: string, field: string) => void;
}) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{title}</span>
      {headers.map((h) => (
        <div key={h} className={styles.columnRow}>
          <span className={styles.columnText}>
            <strong>{h}</strong>
            <span className={styles.hint}>{samples(rows, h).join(' · ') || 'Empty'}</span>
          </span>
          <select className={styles.select} value={mapping[h] ?? 'ignore'} onChange={(e) => onChange(h, e.target.value)} aria-label={`Field for ${h}`}>
            <option value="ignore">Ignore</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key} disabled={Object.entries(mapping).some(([other, used]) => other !== h && used === f.key)}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function ReviewStep({ v }: { v: ProjectImport }) {
  const { isWide } = useLayout();
  const groups = new Map<string, ProjectImport['items']>();
  for (const i of v.shown) {
    const name = i.kind === 'project' ? (i.project?.name ?? '') : (i.task?.project ?? '');
    groups.set(name, [...(groups.get(name) ?? []), i]);
  }
  const counts = (s: RowStatus) => v.items.filter((i) => i.status === s).length;
  return (
    <div className={styles.stack}>
      <p className={styles.summary}>{v.summaryText}.</p>

      <span className={styles.chips} role="group" aria-label="Show">
        {(['all', 'new', 'duplicate', 'possible', 'problem'] as const).map((s) => (
          <button key={s} type="button" className={styles.chip} aria-pressed={v.filter === s} onClick={() => v.setFilter(s)}>
            {s === 'all' ? `All ${v.items.length}` : `${STATUS_LABEL[s]} ${counts(s)}`}
          </button>
        ))}
      </span>

      {(counts('duplicate') > 0 || counts('possible') > 0) && (
        <span className={styles.bulk}>
          {counts('duplicate') > 0 && (
            <>
              <button type="button" className={styles.secondary} onClick={() => v.decideAll('duplicate', 'skip')}>
                Skip duplicates
              </button>
              <button type="button" className={styles.secondary} onClick={() => v.decideAll('duplicate', 'update')}>
                Update duplicates
              </button>
            </>
          )}
          {counts('possible') > 0 && (
            <>
              <button type="button" className={styles.secondary} onClick={() => v.decideAll('possible', 'create')}>
                Create possible duplicates
              </button>
              <button type="button" className={styles.secondary} onClick={() => v.decideAll('possible', 'skip')}>
                Skip possible duplicates
              </button>
            </>
          )}
        </span>
      )}

      {v.missingAreas.length > 0 && (
        <div className={styles.card}>
          <span className={styles.label}>Areas that don&apos;t exist yet</span>
          {v.missingAreas.map((name) => (
            <label key={name} className={styles.pickRow}>
              {name}
              <select className={styles.select} value={v.areaChoice[name] ?? ''} onChange={(e) => v.setAreaChoice({ ...v.areaChoice, [name]: e.target.value })}>
                <option value="">Create it</option>
                {v.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    Use {a.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {[...groups.entries()].map(([project, rows]) => (
        <section key={project || 'none'} className={styles.group}>
          <h3 className={styles.groupTitle}>{project || 'No project'}</h3>
          {isWide ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Choice</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <ReviewRow key={i.key} v={v} item={i} table />
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.list}>
              {rows.map((i) => (
                <ReviewRow key={i.key} v={v} item={i} />
              ))}
            </div>
          )}
        </section>
      ))}

      <Primary label="Continue" onSubmit={() => v.setStep('confirm')} />
    </div>
  );
}

function ReviewRow({ v, item, table = false }: { v: ProjectImport; item: ProjectImport['items'][number]; table?: boolean }) {
  const [fixing, setFixing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const name = item.kind === 'project' ? item.project?.name : item.task?.name;
  const when = item.task ? [item.task.date, fmtMinutes(item.task.start)].filter(Boolean).join(' ') : (item.project?.end ?? '');
  const note = [
    ...item.problems,
    item.match ? `${item.status === 'possible' ? 'Like' : 'Same as'} ${item.match.sameFile ? 'row above' : `"${item.match.name}"`}${item.match.archived ? ' (archived)' : ''}` : null,
    ...item.changes.map((c) => `${c.field}: ${c.from} to ${c.to}`),
  ].filter(Boolean);

  const choices = (
    <span className={styles.choices}>
      <ChoiceButton on={item.decided && item.decision === 'skip'} onClick={() => v.decide(item.key, 'skip')}>
        Skip
      </ChoiceButton>
      {item.status !== 'new' && (
        <ChoiceButton on={item.decided && item.decision === 'create'} onClick={() => v.decide(item.key, 'create')} disabled={item.status === 'problem'}>
          Create anyway
        </ChoiceButton>
      )}
      {item.match && !item.match.sameFile && (
        <ChoiceButton on={item.decided && item.decision === 'update'} onClick={() => v.decide(item.key, 'update')}>
          {item.match.archived ? 'Restore and update' : 'Update existing'}
        </ChoiceButton>
      )}
      {item.status === 'problem' && (
        <ChoiceButton on={fixing} onClick={() => setFixing((f) => !f)}>
          Fix
        </ChoiceButton>
      )}
      {item.conflict && (
        <>
          <ChoiceButton on={v.conflictChoice[item.key] === 'free'} onClick={() => v.chooseConflict(item.key, 'free')}>
            Import as free
          </ChoiceButton>
          <ChoiceButton on={v.conflictChoice[item.key] === 'unscheduled'} onClick={() => v.chooseConflict(item.key, 'unscheduled')}>
            Leave unscheduled
          </ChoiceButton>
        </>
      )}
    </span>
  );
  const fixer = fixing && (
    <span className={styles.fixer}>
      <input className={styles.select} placeholder="Name" defaultValue={name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      {item.kind === 'task' && (
        <>
          <input className={styles.select} placeholder="Date (31/12/2026)" onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input className={styles.select} placeholder="Start" onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          <input className={styles.select} placeholder="End" onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
        </>
      )}
      <button
        type="button"
        className={styles.secondary}
        onClick={() => {
          v.fix(item, draft);
          setFixing(false);
        }}
      >
        Apply
      </button>
    </span>
  );
  const chip = (
    <span className={styles.status} data-status={item.status}>
      {item.conflict ? 'Time conflict' : STATUS_LABEL[item.status]}
    </span>
  );

  if (table) {
    return (
      <tr data-attention={!item.decided || undefined}>
        <td className={styles.num}>{item.rowNumber}</td>
        <td>
          {item.kind === 'project' ? <strong>{name}</strong> : name}
          {note.length > 0 && <span className={styles.note}>{note.join(' · ')}</span>}
          {fixer}
        </td>
        <td>{when}</td>
        <td>{chip}</td>
        <td>{choices}</td>
      </tr>
    );
  }
  return (
    <div className={styles.item} data-attention={!item.decided || undefined}>
      <span className={styles.itemTop}>
        <span className={styles.itemName}>{item.kind === 'project' ? <strong>{name}</strong> : name}</span>
        {chip}
      </span>
      {when && <span className={styles.hint}>{when}</span>}
      {note.length > 0 && <span className={styles.note}>{note.join(' · ')}</span>}
      {choices}
      {fixer}
    </div>
  );
}

function ChoiceButton({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button type="button" className={styles.choice} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function ConfirmStep({ v }: { v: ProjectImport }) {
  const blocked = v.summary.needAttention > 0;
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <span className={styles.label}>Summary</span>
        <p className={styles.summary}>{v.summaryText}.</p>
        {v.missingAreas.filter((a) => !v.areaChoice[a]).length > 0 && (
          <p className={styles.hint}>New areas: {v.missingAreas.filter((a) => !v.areaChoice[a]).join(', ')}.</p>
        )}
        {blocked && <p className={styles.error}>Make a choice for the rows that need attention first.</p>}
      </div>
      <button type="button" className={styles.secondary} onClick={() => v.setStep('review')}>
        Back to the review
      </button>
      <Primary label="Import" disabled={blocked} onSubmit={() => void v.runImport()} />
    </div>
  );
}

function ResultStep({ v, onClose }: { v: ProjectImport; onClose: () => void }) {
  const log = v.log;
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <span className={styles.label}>{log?.undoneAt ? 'Undone' : 'Imported'}</span>
        <p className={styles.summary}>
          {log?.undoneAt
            ? 'Everything this import created was removed, and what it changed was put back.'
            : `${log?.summary ?? v.summaryText}. ${log ? `${log.created.projects.length} projects and ${log.created.tasks.length} tasks created.` : ''}`}
        </p>
      </div>
      {v.items.length > 0 && (
        <button type="button" className={styles.secondary} onClick={v.downloadReport}>
          Download report (CSV)
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
