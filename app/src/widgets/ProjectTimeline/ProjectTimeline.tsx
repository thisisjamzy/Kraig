'use client';

// The Projects database's Timeline view (Dreda v1.0 `Projects timeline`
// 59140): one bar per project from its start to its end date, across weeks
// or months, grouped under "Area › Folder", each bar its project's label
// hue filled to its progress, an overdue pill after it, and today on a
// lime line. With a mouse, drag either end of a bar to change that date
// (whole days). Projects without both dates are listed under the chart.

import { useRef, useState } from 'react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import styles from './ProjectTimeline.module.css';

const DAY = 86_400_000;

export interface TimelineRow {
  id: string;
  name: string;
  start: Date | null;
  end: Date | null;
  /** Bar accent and fill. */
  accent: string;
  fill: string;
  label?: string;
  /** "Work › Dreda app": rows with the same group sit under one heading. */
  group?: string;
  /** 0 to 1: the bar fills this much in the accent. */
  progress?: number;
  /** The dot before the name. */
  dot?: string;
  /** Text colour on the bar. */
  ink?: string;
  /** "1 overdue", after the bar in red. */
  late?: string | null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function days(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

export function ProjectTimeline({
  rows,
  onChange,
  onOpen,
}: {
  rows: TimelineRow[];
  onChange?: (id: string, start: Date, end: Date) => Promise<unknown> | void;
  onOpen: (id: string) => void;
}) {
  const { finePointer } = useLayout();
  const [scale, setScale] = useState<'weeks' | 'months'>('weeks');
  const [drag, setDrag] = useState<{ id: string; start: Date; end: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = startOfDay(new Date());
  const dated = rows.filter((r) => r.start && r.end) as (TimelineRow & { start: Date; end: Date })[];
  const undated = rows.filter((r) => !r.start || !r.end);
  const pxDay = scale === 'weeks' ? 18 : 4;

  const first = dated.reduce((m, r) => (r.start < m ? r.start : m), addDays(today, -14));
  const last = dated.reduce((m, r) => (r.end > m ? r.end : m), addDays(today, 30));
  const from = scale === 'weeks' ? addDays(startOfDay(first), -((first.getDay() + 6) % 7) - 7) : new Date(first.getFullYear(), first.getMonth() - 1, 1);
  const to = scale === 'weeks' ? addDays(startOfDay(last), 14) : new Date(last.getFullYear(), last.getMonth() + 2, 1);
  const width = days(from, to) * pxDay;
  const x = (d: Date) => days(from, d) * pxDay;

  const ticks: { at: Date; label: string }[] = [];
  if (scale === 'weeks') for (let d = from; d < to; d = addDays(d, 7)) ticks.push({ at: d, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
  else for (let d = from; d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) ticks.push({ at: d, label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) });

  const trackRef = useRef<HTMLDivElement>(null);
  // Group headings, in the rows' own order.
  const lines: ({ kind: 'group'; label: string } | { kind: 'row'; row: TimelineRow & { start: Date; end: Date } })[] = [];
  let lastGroup: string | undefined;
  for (const r of dated) {
    if (r.group && r.group !== lastGroup) lines.push({ kind: 'group', label: r.group });
    lastGroup = r.group;
    lines.push({ kind: 'row', row: r });
  }
  const todayLabel = `Today, ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  function startDrag(e: React.PointerEvent, row: TimelineRow & { start: Date; end: Date }, edge: 'start' | 'end') {
    if (!finePointer || !onChange || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    let current = { id: row.id, start: row.start, end: row.end };
    const move = (ev: PointerEvent) => {
      const delta = Math.round((ev.clientX - x0) / pxDay);
      if (edge === 'start') {
        const start = addDays(row.start, delta);
        current = { ...current, start: start > row.end ? row.end : start };
      } else {
        const end = addDays(row.end, delta);
        current = { ...current, end: end < row.start ? row.start : end };
      }
      setDrag(current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (current.start.getTime() !== row.start.getTime() || current.end.getTime() !== row.end.getTime()) {
        setError(null);
        Promise.resolve(onChange(row.id, current.start, current.end)).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not change the dates.'));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.scale} role="radiogroup" aria-label="Scale">
          {(['weeks', 'months'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scale === s} onClick={() => setScale(s)}>
              {s === 'weeks' ? 'Weeks' : 'Months'}
            </button>
          ))}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.chart}>
        <div className={styles.names}>
          <div className={styles.axisSpacer} />
          {lines.map((l) =>
            l.kind === 'group' ? (
              <div key={`g-${l.label}`} className={styles.groupName}>
                {l.label}
              </div>
            ) : (
              <button key={l.row.id} type="button" className={styles.name} onClick={() => onOpen(l.row.id)} title={l.row.name}>
                {l.row.dot && <span className={styles.nameDot} style={{ background: l.row.dot }} aria-hidden />}
                {l.row.name}
              </button>
            )
          )}
        </div>
        <div className={styles.scroll}>
          <div ref={trackRef} className={styles.track} style={{ width }}>
            <div className={styles.axis}>
              {ticks.map((t) => (
                <span key={t.at.getTime()} className={styles.tick} style={{ left: x(t.at) }}>
                  {t.label}
                </span>
              ))}
            </div>
            {ticks.map((t) => (
              <span key={`l${t.at.getTime()}`} className={styles.gridLine} style={{ left: x(t.at) }} aria-hidden />
            ))}
            <span className={styles.today} style={{ left: x(today) }} aria-label={todayLabel} role="img" />
            <span className={styles.todayChip} style={{ left: x(today) }}>
              {todayLabel}
            </span>
            {lines.map((l) => {
              if (l.kind === 'group') return <div key={`g-${l.label}`} className={styles.groupRow} aria-hidden />;
              const r = l.row;
              const live = drag?.id === r.id ? drag : r;
              const left = x(live.start);
              const w = Math.max(pxDay, (days(live.start, live.end) + 1) * pxDay);
              return (
                <div key={r.id} className={styles.row}>
                  <div
                    className={styles.bar}
                    style={{
                      left,
                      width: w,
                      background: r.progress !== undefined ? `linear-gradient(to right, ${r.accent} ${Math.round(r.progress * 100)}%, ${r.fill} ${Math.round(r.progress * 100)}%)` : r.fill,
                      borderLeftColor: r.accent,
                      borderColor: r.progress !== undefined ? r.accent : undefined,
                      color: r.ink,
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onOpen(r.id);
                    }}
                    title={`${r.name}: ${live.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${live.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  >
                    {finePointer && onChange && <span className={styles.handle} data-edge="start" onPointerDown={(e) => startDrag(e, r, 'start')} onClick={(e) => e.stopPropagation()} aria-hidden />}
                    <span className={styles.barText}>{r.label ?? r.name}</span>
                    {finePointer && onChange && <span className={styles.handle} data-edge="end" onPointerDown={(e) => startDrag(e, r, 'end')} onClick={(e) => e.stopPropagation()} aria-hidden />}
                  </div>
                  {r.late && (
                    <span className={styles.late} style={{ left: left + w + 8 }}>
                      <span className={styles.lateDot} aria-hidden />
                      {r.late}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {undated.length > 0 && (
        <p className={styles.undated}>
          Without start and end dates:{' '}
          {undated.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ', '}
              <button type="button" className={styles.link} onClick={() => onOpen(r.id)}>
                {r.name}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
