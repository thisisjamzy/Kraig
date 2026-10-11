'use client';

// CalendarHeatmap (a month, or a one-row week strip), MatrixHeatmap (rows by
// columns, e.g. hour by weekday), YearHeatmap (one column per week),
// DayTimeline (vertical, one hour per line, a "Now" line) and Gantt
// (projects on a calendar with today marked). Darker means more; zero is
// light grey; still to come is a dashed outline.

import { WEEKDAYS_MON, weekdayMon, MON } from '@/src/shared/dashboard/period';
import { whiteOn } from './math';
import s from './Charts.module.css';

export type HeatTone = 'primary' | 'accent';

/** The fill for a value as a share (0 to 1) of the largest. */
export function heatFill(strength: number, tone: HeatTone): { background: string; color: string } {
  if (strength <= 0) return { background: '#f3f4f6', color: '#4b5563' };
  const t = Math.round(Math.max(0.12, Math.min(1, strength)) * 100);
  if (tone === 'accent') return { background: `color-mix(in srgb, var(--c-accent) ${t}%, #f9fafb)`, color: '#111827' };
  return { background: `color-mix(in srgb, var(--c-primary-dark) ${t}%, var(--c-primary-light))`, color: whiteOn(strength) ? '#ffffff' : '#111827' };
}

function HeatKey({ tone }: { tone: HeatTone }) {
  return (
    <span className={s.scaleKey} aria-hidden>
      Less
      {[0, 0.3, 0.6, 1].map((v) => (
        <i key={v} style={{ background: heatFill(v, tone).background }} />
      ))}
      More
    </span>
  );
}

// ---- Calendar ----

export function CalendarHeatmap({
  days,
  tone,
  format,
  ariaLabel,
}: {
  /** In date order. null value: still to come. */
  days: { date: Date; value: number | null }[];
  tone: HeatTone;
  format: (n: number) => string;
  ariaLabel: string;
}) {
  const max = Math.max(0, ...days.map((d) => d.value ?? 0));
  const lead = days.length ? weekdayMon(days[0].date) : 0;
  return (
    <>
      <div className={s.calendar} role="img" aria-label={ariaLabel}>
        {WEEKDAYS_MON.map((w) => (
          <span key={w} className={s.calHead}>
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const fill = d.value === null ? null : heatFill(max > 0 ? d.value / max : 0, tone);
          return (
            <span
              key={d.date.toISOString()}
              className={s.cell}
              data-future={d.value === null || undefined}
              style={fill ?? undefined}
              title={`${d.date.getDate()} ${MON[d.date.getMonth()]}: ${d.value === null ? 'still to come' : format(d.value)}`}
            >
              <span>{d.date.getDate()}</span>
              {d.value !== null && d.value > 0 && <strong>{format(d.value)}</strong>}
            </span>
          );
        })}
      </div>
      <HeatKey tone={tone} />
    </>
  );
}

// ---- Matrix ----

export function MatrixHeatmap({
  columns,
  rows,
  tone,
  format,
  showValues = true,
  ariaLabel,
}: {
  columns: string[];
  rows: { label: string; cells: (number | null)[] }[];
  tone: HeatTone;
  format: (n: number) => string;
  showValues?: boolean;
  ariaLabel: string;
}) {
  const max = Math.max(0, ...rows.flatMap((r) => r.cells.map((c) => c ?? 0)));
  return (
    <>
      <div className={s.matrix} style={{ gridTemplateColumns: `auto repeat(${columns.length}, minmax(0, 1fr))` }} role="img" aria-label={ariaLabel}>
        <span />
        {columns.map((c) => (
          <span key={c} className={s.matrixHead}>
            {c}
          </span>
        ))}
        {rows.map((r) => (
          <MatrixRow key={r.label} label={r.label} cells={r.cells} columns={columns} max={max} tone={tone} format={format} showValues={showValues} />
        ))}
      </div>
      <HeatKey tone={tone} />
    </>
  );
}

function MatrixRow({ label, cells, columns, max, tone, format, showValues }: { label: string; cells: (number | null)[]; columns: string[]; max: number; tone: HeatTone; format: (n: number) => string; showValues: boolean }) {
  return (
    <>
      <span className={s.matrixRowHead}>{label}</span>
      {cells.map((c, i) => {
        const fill = c === null ? undefined : heatFill(max > 0 ? c / max : 0, tone);
        return (
          <span key={i} className={s.matrixCell} data-future={c === null || undefined} style={fill} title={`${label}, ${columns[i]}: ${c === null ? 'still to come' : format(c)}`}>
            {showValues && c !== null && c > 0 ? format(c) : ''}
          </span>
        );
      })}
    </>
  );
}

// ---- Year ----

export function YearHeatmap({ days, tone, format, ariaLabel }: { days: { date: Date; value: number | null }[]; tone: HeatTone; format: (n: number) => string; ariaLabel: string }) {
  const max = Math.max(0, ...days.map((d) => d.value ?? 0));
  const lead = days.length ? weekdayMon(days[0].date) : 0;
  const months: { label: string; col: number }[] = [];
  days.forEach((d, i) => {
    if (d.date.getDate() === 1 || i === 0) months.push({ label: MON[d.date.getMonth()], col: Math.floor((i + lead) / 7) });
  });
  return (
    <>
      <div className={s.yearWrap}>
        <div className={s.yearMonths} aria-hidden>
          {months.map((m) => (
            <span key={`${m.label}-${m.col}`} style={{ left: m.col * 15 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className={s.year} role="img" aria-label={ariaLabel}>
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d) => (
            <span
              key={d.date.toISOString()}
              className={s.yearCell}
              data-future={d.value === null || undefined}
              style={d.value === null ? undefined : { background: heatFill(max > 0 ? d.value / max : 0, tone).background }}
              title={`${d.date.getDate()} ${MON[d.date.getMonth()]}: ${d.value === null ? 'still to come' : format(d.value)}`}
            />
          ))}
        </div>
      </div>
      <HeatKey tone={tone} />
    </>
  );
}

// ---- Day timeline ----

export interface TimelineBlock {
  start: Date;
  end: Date;
  label: string;
  color: string;
  planned?: boolean;
}

export function DayTimeline({ blocks, from, to, now, ariaLabel }: { blocks: TimelineBlock[]; from: number; to: number; now: Date | null; ariaLabel: string }) {
  const span = to - from;
  const at = (d: Date) => ((d.getHours() + d.getMinutes() / 60 - from) / span) * 100;
  return (
    <div className={s.timeline} role="img" aria-label={ariaLabel}>
      <div className={s.hourLabels} aria-hidden>
        {Array.from({ length: span + 1 }, (_, i) => (
          <span key={i} style={{ top: `${(i / span) * 100}%` }}>
            {String(from + i).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      <div className={s.hourArea}>
        {Array.from({ length: span + 1 }, (_, i) => (
          <span key={i} className={s.gridline} style={{ top: `${(i / span) * 100}%` }} aria-hidden />
        ))}
        {blocks.map((b, i) => {
          const top = Math.max(0, at(b.start));
          const bottom = Math.min(100, at(b.end));
          if (bottom <= 0 || top >= 100 || bottom <= top) return null;
          return (
            <span
              key={i}
              className={s.block}
              data-planned={b.planned || undefined}
              style={{ top: `${top}%`, height: `${bottom - top}%`, background: b.color, color: b.color === 'var(--c-accent)' || b.color === 'var(--c-grey)' ? '#111827' : '#ffffff' }}
              title={b.label}
            >
              {b.label}
            </span>
          );
        })}
        {now && at(now) >= 0 && at(now) <= 100 && (
          <span className={s.nowLine} style={{ top: `${at(now)}%` }}>
            <span>
              Now {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Gantt ----

export function Gantt({
  rows,
  from,
  to,
  today,
  ariaLabel,
}: {
  rows: { label: string; start: Date; end: Date; done: number }[];
  from: Date;
  to: Date;
  today: Date;
  ariaLabel: string;
}) {
  const span = to.getTime() - from.getTime() || 1;
  const at = (d: Date) => ((d.getTime() - from.getTime()) / span) * 100;
  const ticks: Date[] = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) if (d >= from) ticks.push(d);
  if (ticks.length < 2) for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) ticks.push(d);
  const todayAt = at(today);
  return (
    <div className={s.gantt} role="img" aria-label={ariaLabel}>
      {rows.map((r) => {
        const left = Math.max(0, at(r.start));
        const right = Math.min(100, at(r.end));
        return (
          <span key={r.label} style={{ display: 'contents' }}>
            <span className={s.rowLabel}>{r.label}</span>
            <span className={s.ganttTrack}>
              {right > left && (
                <span className={s.ganttBar} style={{ left: `${left}%`, width: `${right - left}%` }}>
                  <span style={{ width: `${Math.max(0, Math.min(1, r.done)) * 100}%` }} />
                </span>
              )}
              {todayAt >= 0 && todayAt <= 100 && <span className={s.ganttToday} style={{ left: `${todayAt}%` }} />}
            </span>
          </span>
        );
      })}
      <span className={s.ganttAxis} aria-hidden>
        {ticks.map((t) => (
          <span key={t.toISOString()} style={{ left: `${at(t)}%` }}>
            {t.getDate() === 1 ? MON[t.getMonth()] : `${t.getDate()} ${MON[t.getMonth()]}`}
          </span>
        ))}
      </span>
    </div>
  );
}
