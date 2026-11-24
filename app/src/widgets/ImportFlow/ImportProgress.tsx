'use client';

// Importing (owner, 24 Nov 2026): the ticked tasks in plan order, each
// ticked off as its chunk lands. A chunk's rows spin together; when it
// commits they turn to ticks one at a time, 40ms apart, flash once and fade
// to 55%, staying in place. React state changes once per chunk; the stagger
// is CSS (a delay per row), animating only opacity and the tick's stroke.
// The table follows the current chunk unless the person has scrolled it.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { TaskImport } from '@/src/logic/importData/useTaskImport';
import type { PlanItem } from '@/src/shared/import/importLog';
import { listWords, plural, StatusIcon, useNarrow, useReducedMotion, useRowWindow, type RowStatus } from './parts';
import s from './ImportFlow.module.css';

type Filter = 'all' | 'imported' | 'failed' | 'waiting';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'imported', label: 'Imported' },
  { key: 'failed', label: 'Failed' },
  { key: 'waiting', label: 'Waiting' },
];
const STAGGER = 40;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The due day from the task's document (its end, in the household's time zone). */
function dueOf(item: PlanItem, timeZone: string): string {
  const d = item.data.dueDate as { toDate?: () => Date; seconds?: number } | null | undefined;
  const at = d?.toDate ? d.toDate() : typeof d?.seconds === 'number' ? new Date(d.seconds * 1000) : null;
  if (!at) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${+p.day} ${MONTHS[+p.month - 1]} ${p.year}`;
}

function minutesText(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (ms < 45_000) return 'less than a minute left';
  return `about ${plural(Math.max(1, min), 'minute')} left`;
}

function elapsedText(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function ImportProgress({ v, onClose }: { v: TaskImport; onClose: () => void }) {
  const run = v.run;
  const narrow = useNarrow();
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<Filter>('all');
  const [userScrolled, setUserScrolled] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // The chunk that just landed, for the stagger (set once per chunk).
  const [prevCurrent, setPrevCurrent] = useState<string[]>(run.current);
  const [fresh, setFresh] = useState<string[]>([]);
  if (run.current !== prevCurrent) {
    if (!run.current.length && prevCurrent.length) setFresh(prevCurrent);
    else if (run.current.length) setFresh([]);
    setPrevCurrent(run.current);
  }

  // A clock for elapsed time while it runs.
  const [now, setNow] = useState(() => Date.now());
  const running = run.status === 'running' || run.status === 'stopping';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const chunk = run.current;
  const current = useMemo(() => new Set(chunk), [chunk]);
  const statusOf = (i: PlanItem): RowStatus => {
    if (current.has(i.id)) return run.status === 'rolling_back' ? 'removing' : 'importing';
    if (i.status === 'writing') return 'waiting';
    return i.status;
  };
  const counts = useMemo(
    () => ({
      imported: run.items.filter((i) => i.status === 'imported').length,
      failed: run.items.filter((i) => i.status === 'failed').length,
      waiting: run.items.filter((i) => i.status === 'waiting' || i.status === 'writing').length,
      removed: run.items.filter((i) => i.status === 'removed').length,
    }),
    [run.items]
  );
  const total = run.items.length;
  const shown = useMemo(
    () =>
      run.items.filter((i) =>
        filter === 'all' ? true : filter === 'imported' ? i.status === 'imported' : filter === 'failed' ? i.status === 'failed' : i.status === 'waiting' || i.status === 'writing'
      ),
    [run.items, filter]
  );

  const rowH = narrow ? 64 : 44;
  const head = narrow ? 0 : 44;
  const win = useRowWindow(shown.length, rowH, scroller, head);

  // Keep the current chunk about a third of the way down, unless the person has scrolled.
  useEffect(() => {
    const el = scroller.current;
    if (!el || userScrolled || !chunk.length) return;
    const at = shown.findIndex((i) => i.id === chunk[0]);
    if (at < 0) return;
    const scrollsItself = el.scrollHeight > el.clientHeight + 1;
    if (!scrollsItself) return;
    el.scrollTo({ top: Math.max(0, at * rowH + head - el.clientHeight / 3), behavior: reduced ? 'auto' : 'smooth' });
  }, [chunk, shown, userScrolled, rowH, head, reduced]);

  const pct = total ? Math.round((counts.imported / total) * 100) : 0;
  const removing = run.removing;
  const avg = run.chunkMs.length >= 2 ? run.chunkMs.reduce((a, b) => a + b, 0) / run.chunkMs.length : null;
  const chunksLeft = Math.ceil(counts.waiting / v.chunkSize);
  const elapsed = run.startedAt ? now - run.startedAt : 0;
  const line =
    run.status === 'rolling_back' && removing
      ? `Removing ${removing.done.toLocaleString('en-GB')} of ${removing.total.toLocaleString('en-GB')}`
      : `${counts.imported.toLocaleString('en-GB')} of ${plural(total, 'task')} imported`;

  return (
    <div className={s.flow}>
      <div className={s.progressHead}>
        <div className={s.progressLine}>
          <span aria-live="polite">{line}</span>
          <span>{run.status === 'rolling_back' && removing ? '' : `${pct}%`}</span>
        </div>
        <div
          className={s.track}
          data-back={run.status === 'rolling_back' || undefined}
          role="progressbar"
          aria-label={run.status === 'rolling_back' ? 'Removing' : 'Imported'}
          aria-valuemin={0}
          aria-valuemax={run.status === 'rolling_back' && removing ? removing.total : total}
          aria-valuenow={run.status === 'rolling_back' && removing ? removing.done : counts.imported}
        >
          <span
            className={s.fill}
            style={{ width: `${run.status === 'rolling_back' && removing ? (removing.total ? ((removing.total - removing.done) / removing.total) * 100 : 0) : pct}%`, display: 'block' }}
          />
        </div>
        <div className={s.counters}>
          <span>
            Imported <strong>{counts.imported.toLocaleString('en-GB')}</strong>
          </span>
          <span>
            Waiting <strong>{counts.waiting.toLocaleString('en-GB')}</strong>
          </span>
          <span>
            Failed <strong>{counts.failed.toLocaleString('en-GB')}</strong>
          </span>
          {counts.removed > 0 && (
            <span>
              Removed <strong>{counts.removed.toLocaleString('en-GB')}</strong>
            </span>
          )}
          {run.startedAt && running && <span>{elapsedText(elapsed)}</span>}
          {running && avg !== null && chunksLeft > 0 && <span>{minutesText(avg * chunksLeft)}</span>}
        </div>
      </div>

      <div className={s.chips} role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={s.chip} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div
        ref={scroller}
        className={s.scroll}
        data-virtual={win.virtual || undefined}
        onWheel={() => setUserScrolled(true)}
        onTouchMove={() => setUserScrolled(true)}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) setUserScrolled(true);
        }}
      >
        <div className={s.table} data-kind="progress" role="table" aria-label="Tasks being imported" style={{ ['--row-h' as string]: `${rowH}px` }}>
          <div className={`${s.tr} ${s.th}`} role="row">
            <div className={s.stick1} role="columnheader">
              Status
            </div>
            <div className={s.stick2} role="columnheader">
              Task
            </div>
            <div role="columnheader">Where</div>
            <div role="columnheader">Due</div>
            <div role="columnheader">Row</div>
            <div role="columnheader">Note</div>
          </div>
          {win.start > 0 && <div style={{ height: win.start * rowH }} aria-hidden />}
          {shown.slice(win.start, win.end).map((i) => {
            const status = statusOf(i);
            const at = fresh.indexOf(i.id);
            const made = listWords(i.created.map((id) => run.places[id]).filter(Boolean).map((x) => `${x.name} ${x.kind}`));
            const note = i.error ?? (status === 'imported' && made ? `Created ${made}` : '');
            return (
              <div
                key={i.id}
                className={`${s.tr} ${s.item}`}
                role="row"
                data-id={i.id}
                data-status={status}
                data-fresh={!reduced && at >= 0 && (status === 'imported' || status === 'removed') ? '' : undefined}
                style={at >= 0 && !reduced ? ({ ['--d' as string]: `${at * STAGGER}ms` } as React.CSSProperties) : undefined}
              >
                <div className={s.stick1} role="cell">
                  <StatusIcon status={status} showText={!narrow} />
                </div>
                <div className={s.stick2} role="cell">
                  <span className={s.cellText}>{i.label}</span>
                </div>
                <div role="cell">
                  <span className={s.cellText}>{i.where}</span>
                </div>
                <div role="cell">{dueOf(i, v.timeZone)}</div>
                <div role="cell">{i.sourceRow || ''}</div>
                <div role="cell" className={s.note}>
                  <span className={s.cellText}>{note}</span>
                </div>
                <span className={s.second}>
                  {i.where}
                  {note ? ` · ${note}` : ''}
                </span>
              </div>
            );
          })}
          {win.end < shown.length && <div style={{ height: (shown.length - win.end) * rowH }} aria-hidden />}
          {shown.length === 0 && <p className={s.empty}>No tasks here.</p>}
        </div>
        {userScrolled && running && (
          <div className={s.jump}>
            <button type="button" onClick={() => setUserScrolled(false)}>
              Jump to current
            </button>
          </div>
        )}
      </div>

      <Footer v={v} onClose={onClose} imported={counts.imported} failed={counts.failed} />
    </div>
  );
}

function Footer({ v, onClose, imported, failed }: { v: TaskImport; onClose: () => void; imported: number; failed: number }) {
  const run = v.run;
  if (run.status === 'running')
    return (
      <div className={s.footer}>
        <span className={s.muted}>Stopping keeps what is already in.</span>
        <button type="button" className={s.button} onClick={() => void v.stop()}>
          Stop import
        </button>
      </div>
    );
  if (run.status === 'stopping')
    return (
      <div className={s.footer}>
        <span className={s.muted} role="status">
          Stopping after this chunk…
        </span>
      </div>
    );
  if (run.status === 'stopped')
    return (
      <div className={s.footer}>
        <span className={s.muted}>
          Stopped. {plural(imported, 'task')} {imported === 1 ? 'is' : 'are'} in.
        </span>
        <div className={s.footerEnd}>
          <button type="button" className={s.button} onClick={v.keep}>
            Keep {imported.toLocaleString('en-GB')} imported
          </button>
          <button type="button" className={s.danger} onClick={() => void v.rollback()} disabled={!imported && !run.items.some((i) => i.error)}>
            {run.items.some((i) => i.error && i.status === 'imported') ? 'Try again' : `Remove ${imported.toLocaleString('en-GB')} imported`}
          </button>
        </div>
      </div>
    );
  if (run.status === 'rolling_back')
    return (
      <div className={s.footer}>
        <span className={s.muted} role="status">
          Removing what this import added…
        </span>
      </div>
    );
  if (run.status === 'rolled_back')
    return (
      <div className={s.footer}>
        <div className={s.flow}>
          <span>Nothing from this file is left in Dreda.</span>
          {run.kept.length > 0 && (
            <span className={s.muted}>
              Kept, because something else is in {run.kept.length === 1 ? 'it' : 'them'} now: {run.kept.map((k) => `${k.kind} ${k.name}`).join(', ')}.
            </span>
          )}
        </div>
        <button type="button" className={s.primary} onClick={onClose}>
          Close
        </button>
      </div>
    );
  if (run.status === 'failed')
    return (
      <div className={s.footer}>
        <span className={s.error}>The import could not start.</span>
        <button type="button" className={s.primary} onClick={onClose}>
          Close
        </button>
      </div>
    );
  // Completed.
  const report = failed > 0 || v.leftOut.total > 0;
  return (
    <div className={s.footer}>
      <div className={s.flow}>
        <span>
          Imported {plural(imported, 'task')}
          {v.projectsUsed.length ? ` into ${plural(v.projectsUsed.length, 'project')}` : ''}.
        </span>
        <div className={s.row}>
          {v.projectsUsed.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={`${s.ghost} ${s.small}`}>
              {p.name} · {p.count}
            </Link>
          ))}
        </div>
      </div>
      <div className={s.footerEnd}>
        {v.canUndo && (
          <button type="button" className={s.ghost} onClick={() => void v.undo()}>
            Undo import
          </button>
        )}
        {report && (
          <button type="button" className={s.ghost} onClick={v.downloadReport}>
            Download report
          </button>
        )}
        {failed > 0 && (
          <button type="button" className={s.button} onClick={() => void v.retryFailed()}>
            Retry {failed.toLocaleString('en-GB')} failed
          </button>
        )}
        <button type="button" className={s.primary} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
