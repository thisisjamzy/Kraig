'use client';

// Import tasks (owner, 23 Nov 2026; the flow from file to finished, 24 Nov
// 2026). One form for web and phone (FormChrome: a side peek on wide
// screens, full-screen pages on a phone), its steps replacing one another
// under a step indicator. The logic is useTaskImport; the screens are
// widgets/ImportFlow.
//   1. Upload: a drop zone (on a phone, "Choose file") and the template;
//      an import left part way is offered here.
//   2. Columns: only when the headers aren't the template's.
//   3. Review: the dates, "Did you mean", then every row in a table with a
//      tick (ImportReviewTable).
//   4. Ready: every count before the first write (ImportPlanSummary).
//   5. Importing, then stopped, finished or removed (ImportProgress).
// Back works on steps 2 to 4 and keeps every choice.

import { useRef, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useTaskImport, type TaskImport } from '@/src/logic/importData/useTaskImport';
import { matchesTemplate, TASK_LIST_FIELDS, samples, type TaskListField } from '@/src/shared/import/taskList';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useSubmitState } from '@/src/shared/hooks/useSubmitState';
import { FormChrome } from '@/src/widgets/FormFrame/FormFrame';
import { ImportPlanSummary } from '@/src/widgets/ImportFlow/ImportPlanSummary';
import { ImportProgress } from '@/src/widgets/ImportFlow/ImportProgress';
import { ImportReviewTable, type ReviewFilter } from '@/src/widgets/ImportFlow/ImportReviewTable';
import { plural, StepIndicator } from '@/src/widgets/ImportFlow/parts';
import flow from '@/src/widgets/ImportFlow/ImportFlow.module.css';
import styles from './ImportTasksForm.module.css';

const RUN_TITLE: Record<string, string> = {
  running: 'Importing',
  stopping: 'Importing',
  stopped: 'Import stopped',
  completed: 'Import finished',
  rolling_back: 'Removing the import',
  rolled_back: 'Import removed',
  failed: 'Import',
};

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
  const [filter, setFilter] = useState<ReviewFilter>('all');
  if (reportId && !openedReport) {
    setOpenedReport(true);
    void v.openLog(reportId);
  }
  const where = v.context?.project?.name ?? v.context?.area?.name;
  const title =
    v.step === 'upload'
      ? where
        ? `Import tasks into ${where}`
        : 'Import tasks'
      : v.step === 'columns'
        ? 'Match columns'
        : v.step === 'review'
          ? 'Review and select'
          : v.step === 'ready'
            ? 'Ready to import'
            : (RUN_TITLE[v.run.status] ?? 'Importing');
  const columnsSkipped = v.headers.length > 0 && matchesTemplate(v.headers);
  return (
    <FormChrome
      title={title}
      onClose={onClose}
      phoneHeader="bar"
      context={v.fileName ?? undefined}
      // Closing while it runs stops it instead; the keep or remove choice follows.
      beforeClose={() => {
        if (v.run.status === 'running') {
          void v.stop();
          return false;
        }
        return !v.busy;
      }}
    >
      <StepIndicator current={v.step} columnsSkipped={columnsSkipped} />
      {v.error && (
        <p className={styles.error} role="alert">
          {v.error}
        </p>
      )}
      {v.step === 'upload' && <UploadStep v={v} restoreHref={restoreHref} />}
      {v.step === 'columns' && <ColumnsStep v={v} />}
      {v.step === 'review' && <ReviewStep v={v} filter={filter} setFilter={setFilter} columnsSkipped={columnsSkipped} />}
      {v.step === 'ready' && (
        <ReadyStep
          v={v}
          onSeeLeftOut={() => {
            setFilter('left-out');
            v.setStep('review');
          }}
        />
      )}
      {v.step === 'importing' && <ImportProgress v={v} onClose={onClose} />}
    </FormChrome>
  );
}

/** An import left part way: resume it, remove what got in, or keep it. */
function Recovered({ v }: { v: TaskImport }) {
  const r = v.recovered;
  if (!r) return null;
  return (
    <div className={flow.banner} role="status">
      <span>
        An import of {r.fileName} stopped part way. {r.imported.toLocaleString('en-GB')} of {plural(r.total, 'task')} {r.imported === 1 ? 'was' : 'were'} imported.
      </span>
      <div className={flow.row}>
        <button type="button" className={`${flow.primary} ${flow.small}`} onClick={() => void v.resume()}>
          Resume
        </button>
        <button type="button" className={`${flow.button} ${flow.small}`} onClick={() => void v.removeRecovered()}>
          Remove imported
        </button>
        <button type="button" className={`${flow.ghost} ${flow.small}`} onClick={() => void v.keepRecovered()}>
          Keep what&rsquo;s there
        </button>
      </div>
    </div>
  );
}

function UploadStep({ v, restoreHref }: { v: TaskImport; restoreHref?: string }) {
  const { isWide } = useLayout();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className={styles.stack}>
      <Recovered v={v} />
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
        <p className={styles.hint}>One sheet of tasks. Every row needs its Area, Folder and Project; anything new is created with the first task that names it. It also lists your current areas, folders and projects.</p>
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
      <div className={flow.footer}>
        <button type="button" className={flow.button} onClick={() => v.setStep('upload')}>
          Back
        </button>
        <button type="button" className={flow.primary} disabled={!Object.values(v.mapping).includes('task')} onClick={() => v.confirmColumns()}>
          Continue
        </button>
      </div>
    </div>
  );
}

function ReviewStep({ v, filter, setFilter, columnsSkipped }: { v: TaskImport; filter: ReviewFilter; setFilter: (f: ReviewFilter) => void; columnsSkipped: boolean }) {
  const plan = v.plan;
  if (!plan) return null;
  const unanswered = plan.questions.filter((q) => !q.answer).length;
  const why = !plan.counts.tasks
    ? 'Tick at least one task that is ready.'
    : unanswered
      ? `Answer ${unanswered === 1 ? 'the question' : `the ${unanswered} questions`} above first.`
      : v.clashesOpen
        ? `Choose what to do with ${plural(v.clashesOpen, 'ticked time clash', 'ticked time clashes')}.`
        : null;
  return (
    <div className={flow.flow}>
      {v.dueOrder && (v.orderNote || v.dueOrder.conflict) && (
        <div className={flow.card}>
          <p className={flow.cardTitle}>Dates</p>
          {v.orderNote && <p className={flow.muted}>{v.orderNote}</p>}
          {v.dueOrder.conflict && <p className={flow.muted}>Some dates in this column can only be day first and others only month first. Those rows need a look.</p>}
          <div className={flow.row}>
            <button type="button" className={flow.chip} aria-pressed={v.order === 'dmy'} onClick={() => v.setOrder('dmy')}>
              Day first
            </button>
            <button type="button" className={flow.chip} aria-pressed={v.order === 'mdy'} onClick={() => v.setOrder('mdy')}>
              Month first
            </button>
          </div>
        </div>
      )}

      {plan.questions.map((q) => (
        <div key={q.key} className={flow.card} data-attention={!q.answer || undefined}>
          <p className={flow.cardTitle}>Did you mean {q.existing.name}?</p>
          <p className={flow.muted}>
            The file says &ldquo;{q.name}&rdquo;{q.parentName ? ` in ${q.parentName}` : ''}. There is already a {q.kind} called &ldquo;{q.existing.name}&rdquo;. This applies to every row with that name.
          </p>
          <div className={flow.row}>
            <button type="button" className={flow.chip} aria-pressed={q.answer === 'existing'} onClick={() => v.answer(q.key, 'existing')}>
              Use existing
            </button>
            <button type="button" className={flow.chip} aria-pressed={q.answer === 'new'} onClick={() => v.answer(q.key, 'new')}>
              Create new
            </button>
          </div>
        </div>
      ))}

      <ImportReviewTable v={v} filter={filter} setFilter={setFilter} />

      <div className={flow.footer}>
        <button type="button" className={flow.button} onClick={() => v.setStep(columnsSkipped ? 'upload' : 'columns')}>
          Back
        </button>
        <div className={flow.footerEnd}>
          {why && <span className={flow.muted}>{why}</span>}
          <button type="button" className={flow.primary} disabled={Boolean(why)} onClick={() => v.setStep('ready')}>
            Next: {plural(plan.counts.tasks, 'task')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadyStep({ v, onSeeLeftOut }: { v: TaskImport; onSeeLeftOut: () => void }) {
  const tasks = v.runPlan?.counts.tasks ?? 0;
  return (
    <div className={flow.flow}>
      <ImportPlanSummary v={v} onSeeLeftOut={onSeeLeftOut} />
      <div className={flow.footer}>
        <button type="button" className={flow.button} onClick={() => v.setStep('review')}>
          Back
        </button>
        <StartButton disabled={!tasks} onStart={v.start} />
      </div>
    </div>
  );
}

/** Start import: the one primary button, locked once pressed. */
function StartButton({ disabled, onStart }: { disabled: boolean; onStart: () => Promise<void> }) {
  const { phase, run } = useSubmitState();
  return (
    <button type="button" className={flow.primary} disabled={disabled || phase !== 'idle'} onClick={() => void run(onStart).catch(() => undefined)}>
      Start import
    </button>
  );
}
