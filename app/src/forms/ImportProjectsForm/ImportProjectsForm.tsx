'use client';

// Import from a spreadsheet, Time or Money template: one form for both
// layouts (FormChrome: a side peek on wide screens, full-screen pages on a
// phone), its steps replacing one another. The logic is useProjectImport.
//   1. Upload: a drop zone (on a phone, "Choose file"), "Download template"
//      (Time or Money), and on wide screens rows pasted from a spreadsheet.
//      A file of the other kind is named, with an offer to switch.
//   2. Match columns: the sheets found with their row counts, then each
//      sheet's columns, three samples and the field each fills.
//   3. Review: a table (a list with status chips on a phone) grouped by
//      sheet and project: New, Linked to existing, Duplicate, Problem; each
//      row in plain words, with its choices and bulk actions per type.
//   4. Confirm: the summary, what will be created, and "Import".
// Then progress, and the result with its report and Undo.

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useProjectImport, type ImportStep, type Item, type ProjectImport } from '@/src/logic/importData/useProjectImport';
import { samples } from '@/src/shared/import/projectTasks';
import { KIND_WORDS, STATUS_LABEL, type ItemKind, type RowStatus } from '@/src/shared/import/review';
import { TEMPLATE_LABEL, type TemplateKind } from '@/src/shared/import/templates';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { FormChrome } from '@/src/widgets/FormFrame/FormFrame';
import { TemplateChooserButton } from '@/src/widgets/TemplateChooser/TemplateChooser';
import styles from './ImportProjectsForm.module.css';

const STEP_TITLE: Record<ImportStep, string> = {
  upload: 'Import from spreadsheet',
  match: 'Match columns',
  review: 'Review',
  confirm: 'Confirm',
  importing: 'Importing',
  result: 'Import finished',
};
const KIND_ORDER: ItemKind[] = ['area', 'section', 'project', 'task', 'wallet', 'income', 'basket', 'basketItem'];
const plural = (k: ItemKind) => KIND_WORDS[k][1].charAt(0).toUpperCase() + KIND_WORDS[k][1].slice(1);
const shortDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function ImportProjectsForm({
  projectId = null,
  kind = null,
  reportId = null,
  onClose,
  restoreHref,
}: {
  projectId?: string | null;
  /** The import this was opened for (a basket's "Import items" is Money); null detects it from the file. */
  kind?: TemplateKind | null;
  /** An earlier import's report to show (the notification's link). */
  reportId?: string | null;
  onClose: () => void;
  restoreHref?: string;
}) {
  const v = useProjectImport({ projectId, kind: kind ?? (projectId ? 'time' : null) });
  const [openedReport, setOpenedReport] = useState(false);
  if (reportId && !openedReport) {
    setOpenedReport(true);
    void v.openLog(reportId);
  }
  const title = v.step === 'upload' && v.contextProject ? `Import tasks into ${v.contextProject.name}` : STEP_TITLE[v.step];
  const context = [v.step !== 'upload' && v.sheets.length ? v.kindLabel : null, v.fileName].filter(Boolean).join(' · ');
  return (
    <FormChrome title={title} onClose={onClose} phoneHeader="bar" context={context || undefined}>
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
      {v.mismatch && (
        <div className={styles.card} role="alert">
          <span className={styles.label}>This is a {TEMPLATE_LABEL[v.mismatch]} file</span>
          <p className={styles.summary}>
            {v.fileName} has {v.mismatch === 'money' ? 'wallets, baskets or basket items' : 'areas, projects or tasks'}, but this import is for {v.wanted === 'money' ? 'money' : 'projects and tasks'}.
          </p>
          <span className={styles.bulk}>
            <button type="button" className={styles.secondary} onClick={v.switchKind}>
              Switch to the {v.mismatch === 'money' ? 'Money' : 'Time'} import
            </button>
            <button type="button" className={styles.secondary} onClick={v.reset}>
              Choose another file
            </button>
          </span>
        </div>
      )}

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
        <span className={styles.hint}>.xlsx, .xls or .csv, up to 2,000 rows. Time and Money files are recognised.</span>
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
        <p className={styles.hint}>A Time template (areas, sections, projects and tasks, with repeats and time mode) or a Money template (baskets, basket items, income sources and wallets), with a Read me and dropdowns.</p>
        <TemplateChooserButton className={styles.templateRow}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> Download template
        </TemplateChooserButton>
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
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <span className={styles.label}>{v.kindLabel}</span>
        <ul className={styles.sheetList}>
          {v.sheets.map((s) => (
            <li key={s.name}>
              {s.name} <span className={styles.hint}>{s.rows.length.toLocaleString('en-US')} rows</span>
            </li>
          ))}
        </ul>
        {v.oldTemplate && <p className={styles.hint}>This file uses the old template; download the new one to set repeats and time mode.</p>}
      </div>

      {v.sheets.length > 1 && (
        <div className={styles.card}>
          <span className={styles.label}>Sheets</span>
          {v.allSpecs
            .filter((spec) => !(v.contextProject && spec.name !== 'Tasks'))
            .map((spec) => (
              <label key={spec.name} className={styles.pickRow}>
                {spec.name}
                <select className={styles.select} value={v.assigned[spec.name] ?? ''} onChange={(e) => v.assignSheet(spec.name, e.target.value || null)}>
                  <option value="">None</option>
                  {sheetOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
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

      {v.specs.map(({ spec, sheet }) => {
        const mapping = v.mappings[spec.name] ?? {};
        const legacy = Object.values(mapping).some((k) => k === 'legacyStart' || k === 'legacyDue');
        const fields = [
          ...spec.columns.map((c) => ({ key: c.key, label: c.header })),
          ...(legacy
            ? [
                { key: 'legacyStart', label: 'Start (date and time, old template)' },
                { key: 'legacyDue', label: 'Due (date and time, old template)' },
              ]
            : []),
        ];
        return (
          <div key={spec.name} className={styles.card}>
            <span className={styles.label}>
              {spec.name} ({sheet.name})
            </span>
            {sheet.headers
              .filter((h) => mapping[h] !== 'rowType')
              .map((h) => (
                <div key={h} className={styles.columnRow}>
                  <span className={styles.columnText}>
                    <strong>{h}</strong>
                    <span className={styles.hint}>{samples(sheet.rows.slice(1), h).join(' · ') || 'Empty'}</span>
                  </span>
                  <select className={styles.select} value={mapping[h] ?? 'ignore'} onChange={(e) => v.setColumn(spec.name, h, e.target.value)} aria-label={`Field for ${h}`}>
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
      })}

      <Primary label="Review rows" onSubmit={v.confirmMapping} />
    </div>
  );
}

function ReviewStep({ v }: { v: ProjectImport }) {
  const { isWide } = useLayout();
  const counts = (s: RowStatus) => v.items.filter((i) => i.status === s).length;
  const kinds = KIND_ORDER.filter((k) => v.shown.some((i) => i.kind === k));
  const dupKinds = KIND_ORDER.filter((k) => v.items.some((i) => i.kind === k && i.status === 'duplicate'));
  return (
    <div className={styles.stack}>
      <p className={styles.summary}>{v.summaryText}.</p>
      {v.oldTemplate && <p className={styles.hint}>This file uses the old template; download the new one to set repeats and time mode.</p>}
      {v.implied.map((line) => (
        <p key={line} className={styles.hint}>
          {line}.
        </p>
      ))}

      <span className={styles.chips} role="group" aria-label="Show">
        {(['all', 'new', 'linked', 'duplicate', 'problem'] as const).map((s) => (
          <button key={s} type="button" className={styles.chip} aria-pressed={v.filter === s} onClick={() => v.setFilter(s)}>
            {s === 'all' ? `All ${v.items.length}` : `${STATUS_LABEL[s]} ${counts(s)}`}
          </button>
        ))}
      </span>

      {dupKinds.length > 0 && (
        <span className={styles.bulk}>
          {dupKinds.map((k) => (
            <span key={k} className={styles.bulk}>
              <button type="button" className={styles.secondary} onClick={() => v.decideAll(k, 'skip')}>
                Skip all duplicate {KIND_WORDS[k][1]}
              </button>
              <button type="button" className={styles.secondary} onClick={() => v.decideAll(k, 'update')}>
                Update all duplicate {KIND_WORDS[k][1]}
              </button>
            </span>
          ))}
        </span>
      )}

      {kinds.map((k) => {
        const groups = new Map<string, Item[]>();
        for (const i of v.shown.filter((x) => x.kind === k)) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
        return (
          <section key={k} className={styles.group}>
            <h3 className={styles.groupTitle}>{plural(k)}</h3>
            {[...groups.entries()].map(([group, rows]) => (
              <div key={group} className={styles.group}>
                {groups.size > 1 || !['Areas', 'Projects', 'Wallets', 'Baskets'].includes(group) ? <h4 className={styles.subTitle}>{group}</h4> : null}
                {isWide ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Name</th>
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
              </div>
            ))}
          </section>
        );
      })}

      <Primary label="Continue" onSubmit={() => v.setStep('confirm')} />
    </div>
  );
}

function ReviewRow({ v, item, table = false }: { v: ProjectImport; item: Item; table?: boolean }) {
  const [fixing, setFixing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const implied = item.rowNumber === null;
  const conflict = item.conflictDates.length > 0 && item.decision !== 'skip';
  const repeatChange = item.decision === 'update' && item.changes.some((c) => c.field === 'Repeats');
  const note = [
    ...item.problems,
    ...item.notes,
    implied ? (item.status === 'linked' ? 'Named in the file; already in Dreda' : 'Named in the file; will be created') : null,
    item.match && !item.match.sameFile && item.status === 'duplicate' ? `Already in Dreda as "${item.match.name}"${item.match.archived ? ' (archived)' : ''}` : null,
    ...(item.status === 'duplicate' ? item.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`) : []),
    conflict
      ? `Clashes with your calendar on ${item.conflictDates.length === 1 ? '1 date' : `${item.conflictDates.length} dates`}: ${item.conflictDates.slice(0, 4).map(shortDay).join(', ')}${item.conflictDates.length > 4 ? '…' : ''}`
      : null,
  ].filter(Boolean);

  const choices = implied ? null : (
    <span className={styles.choices}>
      {item.status !== 'linked' && (
        <ChoiceButton on={item.decided && item.decision === 'skip'} onClick={() => v.decide(item.key, 'skip')}>
          Skip
        </ChoiceButton>
      )}
      {item.status === 'new' && (
        <ChoiceButton on={item.decision === 'create'} onClick={() => v.decide(item.key, 'create')}>
          Import
        </ChoiceButton>
      )}
      {item.status === 'duplicate' && item.match && !item.match.sameFile && (
        <ChoiceButton on={item.decision === 'update'} onClick={() => v.decide(item.key, 'update')}>
          {item.match.archived ? 'Restore and update' : 'Update existing'}
        </ChoiceButton>
      )}
      {item.status === 'duplicate' && item.canCreateAnyway && (
        <ChoiceButton
          on={item.decision === 'create'}
          onClick={() => {
            if (v.createAnywayConfirmed || item.decision === 'create') v.decide(item.key, 'create');
            else setConfirming(true);
          }}
        >
          Create anyway
        </ChoiceButton>
      )}
      {item.status === 'problem' && (
        <ChoiceButton on={fixing} onClick={() => setFixing((f) => !f)}>
          Fix
        </ChoiceButton>
      )}
      {conflict && (
        <>
          <ChoiceButton on={v.conflictChoice[item.key] === 'free'} onClick={() => v.chooseConflict(item.key, 'free')}>
            Import as free
          </ChoiceButton>
          {item.repeating && (
            <ChoiceButton on={v.conflictChoice[item.key] === 'skipDates'} onClick={() => v.chooseConflict(item.key, 'skipDates')}>
              Skip conflicting dates
            </ChoiceButton>
          )}
          <ChoiceButton on={v.conflictChoice[item.key] === 'unscheduled'} onClick={() => v.chooseConflict(item.key, 'unscheduled')}>
            Leave unscheduled
          </ChoiceButton>
          <ChoiceButton on={v.conflictChoice[item.key] === 'skip'} onClick={() => v.chooseConflict(item.key, 'skip')}>
            Skip task
          </ChoiceButton>
        </>
      )}
      {repeatChange && (
        <>
          <ChoiceButton on={v.repeatScope[item.key] === 'future'} onClick={() => v.chooseScope(item.key, 'future')}>
            This and future occurrences
          </ChoiceButton>
          <ChoiceButton on={v.repeatScope[item.key] === 'all'} onClick={() => v.chooseScope(item.key, 'all')}>
            All occurrences
          </ChoiceButton>
        </>
      )}
    </span>
  );
  const confirm = confirming && (
    <span className={styles.fixer} role="group" aria-label="Create anyway">
      <span className={styles.note}>Create a second &ldquo;{item.name}&rdquo; with the same name? Other duplicates can then be created without asking.</span>
      <button
        type="button"
        className={styles.secondary}
        onClick={() => {
          v.decide(item.key, 'create');
          setConfirming(false);
        }}
      >
        Create it
      </button>
      <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
  const fixer = fixing && (
    <span className={styles.fixer}>
      <input className={styles.select} placeholder="Name" defaultValue={item.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      {item.kind === 'task' && (
        <>
          <input className={styles.select} placeholder="Date (31/12/2026)" onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input className={styles.select} placeholder="Start (06:00)" onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          <input className={styles.select} placeholder="End (07:00)" onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
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
    <span className={styles.status} data-status={conflict ? 'possible' : item.status}>
      {conflict ? 'Time conflict' : STATUS_LABEL[item.status]}
    </span>
  );
  const name = item.kind === 'task' || item.kind === 'basketItem' || item.kind === 'income' ? item.name : <strong>{item.name}</strong>;

  if (table) {
    return (
      <tr data-attention={!item.decided || undefined}>
        <td className={styles.num}>{item.rowNumber ?? ''}</td>
        <td>
          {name}
          {item.text && <span className={styles.hint}>{item.text}</span>}
          {note.length > 0 && <span className={styles.note}>{note.join(' · ')}</span>}
          {confirm}
          {fixer}
        </td>
        <td>{chip}</td>
        <td>{choices}</td>
      </tr>
    );
  }
  return (
    <div className={styles.item} data-attention={!item.decided || undefined}>
      <span className={styles.itemTop}>
        <span className={styles.itemName}>{name}</span>
        {chip}
      </span>
      {item.text && <span className={styles.hint}>{item.text}</span>}
      {note.length > 0 && <span className={styles.note}>{note.join(' · ')}</span>}
      {choices}
      {confirm}
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
        {v.implied.map((line) => (
          <p key={line} className={styles.hint}>
            {line}.
          </p>
        ))}
        {blocked && <p className={styles.error}>Fix or skip the rows that need attention first.</p>}
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
  const c = log?.created;
  const made = c
    ? [
        [c.areas.length, KIND_WORDS.area],
        [c.projects.length, KIND_WORDS.project],
        [c.tasks.length, KIND_WORDS.task],
        [c.wallets?.length ?? 0, KIND_WORDS.wallet],
        [c.baskets?.length ?? 0, KIND_WORDS.basket],
        [c.items?.length ?? 0, ['item', 'items']],
      ]
        .filter(([n]) => (n as number) > 0)
        .map(([n, w]) => `${n} ${(n as number) === 1 ? (w as string[])[0] : (w as string[])[1]}`)
    : [];
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <span className={styles.label}>{log?.undoneAt ? 'Undone' : 'Imported'}</span>
        <p className={styles.summary}>
          {log?.undoneAt
            ? 'Everything this import created was removed, and what it changed was put back.'
            : `${log?.summary ?? v.summaryText}.${made.length ? ` Created: ${made.join(', ')}.` : ''}`}
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
