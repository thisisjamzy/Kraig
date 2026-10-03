'use client';

// The Insights chart cards — each a white card with a title, a one-line
// takeaway (from compute.ts) and its chart, or a friendly empty state.
// Charts are Recharts; colors come from CSS custom properties on the
// Insights page (--i-*), so light/dark mode follow the app theme. Every
// series is labelled (legend + tooltip), never told apart by color alone,
// and tapping a bar or point opens the tasks behind it.

import { useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Quadrant } from '@/src/shared/firestore/types';
import type { DayLoad, DayStat, EstimateAccuracy, QuadrantMix, SeriesConsistency } from '@/src/viewmodels/insights/metrics';
import { atTime } from '@/src/viewmodels/insights/dates';
import type { RangeKind } from '@/src/viewmodels/insights/types';
import styles from './InsightsScreen.module.css';

// ---------------------------------------------------------------------------
// Shared bits

export function ChartCard({
  title,
  takeaway,
  empty,
  emptyText,
  action,
  children,
}: {
  title: string;
  takeaway: string;
  empty: boolean;
  emptyText: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {action}
      </header>
      <p className={styles.takeaway}>{empty ? emptyText : takeaway}</p>
      {!empty && <div className={styles.chart}>{children}</div>}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string; pattern?: 'dashed' }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={styles.legendSwatch}
            data-pattern={item.pattern}
            style={{ background: item.pattern ? 'transparent' : item.color, borderColor: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const AXIS_TICK = { fill: 'var(--color-text-secondary)', fontSize: 11 };
const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--color-text-primary)',
  },
  labelStyle: { color: 'var(--color-text-secondary)', marginBottom: 2 },
  cursor: { fill: 'color-mix(in srgb, var(--color-text-secondary) 10%, transparent)' },
};

function dayLabel(date: Date, kind: RangeKind, count: number): string {
  if (count <= 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return String(date.getDate());
}
function fullDay(date: Date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function hoursText(minutes: number) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}
/** Index of the tapped category from a Recharts chart click. */
function tappedIndex(state: { activeIndex?: unknown; activeTooltipIndex?: unknown } | null): number | null {
  const raw = state?.activeIndex ?? state?.activeTooltipIndex;
  const n = Number(raw);
  return raw === undefined || raw === null || Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// 1. Completion trend

export function CompletionTrend({
  data,
  kind,
  target,
  onPickDay,
}: {
  data: DayStat[];
  kind: RangeKind;
  target: number;
  onPickDay: (date: Date) => void;
}) {
  const rows = data.map((d) => ({
    label: dayLabel(d.date, kind, data.length),
    full: fullDay(d.date),
    rate: d.rate === null ? null : Math.round(d.rate * 100),
    done: d.done,
  }));
  return (
    <>
      <AreaChart
        responsive
        style={{ width: '100%', height: 190 }}
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
        onClick={(state) => {
          const i = tappedIndex(state);
          if (i !== null && data[i]) onPickDay(data[i].date);
        }}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--i-done)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--i-done)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--i-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} unit="%" />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
          formatter={(value) => [value === null || value === undefined ? 'Nothing due' : `${value}%`, 'Completed']}
        />
        <ReferenceLine
          y={target}
          stroke="var(--color-text-secondary)"
          strokeDasharray="5 4"
          label={{ value: `${target}% target`, position: 'insideTopRight', fill: 'var(--color-text-secondary)', fontSize: 11 }}
        />
        <Area
          type="monotone"
          dataKey="rate"
          stroke="var(--i-done)"
          strokeWidth={2.5}
          fill="url(#trendFill)"
          connectNulls
          dot={{ r: 3, fill: 'var(--i-done)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          name="Completed"
          isAnimationActive={false}
        />
      </AreaChart>
      <Legend
        items={[
          { label: 'Daily completion', color: 'var(--i-done)' },
          { label: `${target}% target`, color: 'var(--color-text-secondary)', pattern: 'dashed' },
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Planned vs done

export function PlannedVsDone({
  data,
  kind,
  onPickDay,
}: {
  data: DayStat[];
  kind: RangeKind;
  onPickDay: (date: Date) => void;
}) {
  const rows = data.map((d) => ({
    label: dayLabel(d.date, kind, data.length),
    full: fullDay(d.date),
    planned: d.planned,
    cancelled: d.cancelled,
    done: d.done,
  }));
  return (
    <>
      <BarChart
        responsive
        style={{ width: '100%', height: 190 }}
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
        barGap={2}
        onClick={(state) => {
          const i = tappedIndex(state);
          if (i !== null && data[i]) onPickDay(data[i].date);
        }}
      >
        <CartesianGrid vertical={false} stroke="var(--i-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''} />
        <Bar dataKey="planned" name="Planned" stackId="plan" fill="var(--i-planned)" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="cancelled" name="Cancelled" stackId="plan" fill="var(--i-cancel)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="done" name="Done" fill="var(--i-done)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
      <Legend
        items={[
          { label: 'Planned', color: 'var(--i-planned)' },
          { label: 'Done', color: 'var(--i-done)' },
          { label: 'Cancelled', color: 'var(--i-cancel)' },
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Daily load

export function DailyLoad({
  data,
  kind,
  capacityHours,
  onPickDay,
}: {
  data: DayLoad[];
  kind: RangeKind;
  capacityHours: number;
  onPickDay: (date: Date) => void;
}) {
  const capacity = capacityHours * 60;
  const rows = data.map((d) => {
    // The part over capacity is its own (red) top segment.
    const over = Math.max(0, d.scheduledMinutes - capacity);
    const blocked = Math.min(d.blockedMinutes, capacity);
    const free = Math.max(0, Math.min(d.freeMinutes, capacity - blocked));
    return {
      label: dayLabel(d.date, kind, data.length),
      full: fullDay(d.date),
      blocked: blocked / 60,
      free: free / 60,
      over: over / 60,
      total: d.scheduledMinutes / 60,
    };
  });
  return (
    <>
      <BarChart
        responsive
        style={{ width: '100%', height: 200 }}
        data={rows}
        margin={{ top: 12, right: 8, bottom: 0, left: -24 }}
        onClick={(state) => {
          const i = tappedIndex(state);
          if (i !== null && data[i]) onPickDay(data[i].date);
        }}
      >
        <CartesianGrid vertical={false} stroke="var(--i-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} unit="h" />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload;
            return p ? `${p.full} · ${p.total.toFixed(1)}h scheduled` : '';
          }}
          formatter={(value, name) => [`${Number(value).toFixed(1)}h`, name]}
        />
        <ReferenceLine
          y={capacityHours}
          stroke="var(--i-cancel)"
          strokeDasharray="5 4"
          label={{ value: `${capacityHours}h capacity`, position: 'insideTopRight', fill: 'var(--color-text-secondary)', fontSize: 11 }}
        />
        <Bar dataKey="blocked" name="Blocked" stackId="load" fill="var(--i-blocked)" isAnimationActive={false} />
        <Bar dataKey="free" name="Free" stackId="load" fill="var(--i-free)" isAnimationActive={false} />
        <Bar dataKey="over" name="Over capacity" stackId="load" fill="var(--i-cancel)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
      <Legend
        items={[
          { label: 'Blocked', color: 'var(--i-blocked)' },
          { label: 'Free', color: 'var(--i-free)' },
          { label: 'Over capacity', color: 'var(--i-cancel)' },
        ]}
      />
    </>
  );
}

/** Today: the day as a strip — blocked and free windows, stacked free time
 * outlined, and gaps inside working hours marked. */
export function DayTimeline({
  load,
  workStart,
  workEnd,
  onOpen,
}: {
  load: DayLoad;
  workStart: string;
  workEnd: string;
  onOpen: (id: string) => void;
}) {
  const ws = atTime(load.date, workStart);
  const we = atTime(load.date, workEnd);
  const first = load.windows[0]?.start;
  const last = load.windows.reduce<Date | null>((m, w) => (!m || w.end > m ? w.end : m), null);
  const startHour = Math.min(ws.getHours(), first ? first.getHours() : 24);
  const endHour = Math.max(we.getHours() + (we.getMinutes() ? 1 : 0), last ? last.getHours() + (last.getMinutes() ? 1 : 0) : 0);
  const span = Math.max(1, endHour - startHour) * 60;
  const origin = atTime(load.date, `${startHour}:00`).getTime();
  const pct = (d: Date) => `${Math.max(0, Math.min(100, ((d.getTime() - origin) / 60000 / span) * 100))}%`;
  const width = (a: Date, b: Date) => `${Math.max(0.8, ((b.getTime() - a.getTime()) / 60000 / span) * 100)}%`;

  // Lanes so overlapping windows sit on separate rows.
  const lanes: Date[] = [];
  const placed = load.windows.map((w) => {
    let lane = lanes.findIndex((end) => end <= w.start);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(w.end);
    } else lanes[lane] = w.end;
    return { ...w, lane };
  });

  // Gaps of 30+ min inside working hours.
  const busy = [...load.windows].sort((a, b) => a.start.getTime() - b.start.getTime());
  const gaps: { start: Date; end: Date }[] = [];
  let cursor = ws;
  for (const w of busy) {
    if (w.start > cursor && w.start.getTime() - cursor.getTime() >= 30 * 60000 && cursor < we) {
      gaps.push({ start: cursor, end: w.start < we ? w.start : we });
    }
    if (w.end > cursor) cursor = w.end;
  }
  if (we.getTime() - cursor.getTime() >= 30 * 60000) gaps.push({ start: cursor, end: we });

  const ticks = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).filter(
    (h, i, all) => all.length <= 8 || i % 2 === 0
  );
  const laneCount = Math.max(1, lanes.length);

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineTrack} style={{ height: 14 + laneCount * 30 }}>
        <div className={styles.workBand} style={{ left: pct(ws), width: width(ws, we) }} aria-hidden />
        {gaps.map((g) => (
          <div
            key={g.start.getTime()}
            className={styles.gap}
            style={{ left: pct(g.start), width: width(g.start, g.end) }}
            title={`Free gap ${hhmm(g.start)} to ${hhmm(g.end)}`}
          />
        ))}
        {load.stacked.map((s) => (
          <div
            key={s.start.getTime()}
            className={styles.stackedBand}
            style={{ left: pct(s.start), width: width(s.start, s.end) }}
            title={`Stacked free tasks ${hhmm(s.start)} to ${hhmm(s.end)}`}
          />
        ))}
        {placed.map((w) => (
          <button
            key={w.id}
            type="button"
            className={styles.window}
            data-mode={w.mode}
            style={{ left: pct(w.start), width: width(w.start, w.end), top: 7 + w.lane * 30 }}
            onClick={() => onOpen(w.id)}
            aria-label={`${w.title}, ${hhmm(w.start)} to ${hhmm(w.end)}, ${w.mode}`}
          >
            <span>{w.title}</span>
          </button>
        ))}
      </div>
      <div className={styles.timelineAxis}>
        {ticks.map((h) => (
          <span key={h} style={{ left: `${((h - startHour) * 60 * 100) / span}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      <Legend
        items={[
          { label: 'Blocked', color: 'var(--i-blocked)' },
          { label: 'Free', color: 'var(--i-free)' },
          { label: 'Stacked', color: 'var(--i-amber)', pattern: 'dashed' },
          { label: 'Gap', color: 'var(--color-text-secondary)', pattern: 'dashed' },
        ]}
      />
    </div>
  );
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 4. Priority mix

const QUADRANT_META: Record<Quadrant, { label: string; hint: string; color: string }> = {
  do: { label: 'Do first', hint: 'Urgent, important', color: 'var(--i-q-do)' },
  schedule: { label: 'Schedule', hint: 'Important, not urgent', color: 'var(--i-q-schedule)' },
  delegate: { label: 'Delegate', hint: 'Urgent, not important', color: 'var(--i-q-delegate)' },
  eliminate: { label: 'Eliminate', hint: 'Neither', color: 'var(--i-q-eliminate)' },
};

export function PriorityMix({ mix, onPick }: { mix: QuadrantMix; onPick: (quadrant: Quadrant) => void }) {
  const [view, setView] = useState<'matrix' | 'donut'>('matrix');
  const byHours = mix.totalMinutes > 0;
  const toggle = (
    <div className={styles.miniToggle} role="radiogroup" aria-label="Priority mix view">
      {(['matrix', 'donut'] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}>
          {v === 'matrix' ? 'Matrix' : 'Donut'}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <div className={styles.inlineToggle}>{toggle}</div>
      {view === 'matrix' ? (
        <div className={styles.matrix}>
          <span className={styles.matrixAxisTop} aria-hidden>
            <span>Urgent</span>
            <span>Not urgent</span>
          </span>
          {(['do', 'schedule', 'delegate', 'eliminate'] as Quadrant[]).map((q) => {
            const share = mix.shares.find((s) => s.quadrant === q)!;
            const pct = Math.round((byHours ? share.hourShare : share.taskShare) * 100);
            return (
              <button
                key={q}
                type="button"
                className={styles.quadrant}
                data-quadrant={q}
                onClick={() => onPick(q)}
                aria-label={`${QUADRANT_META[q].label}: ${pct}%, ${hoursText(share.minutes)}, ${share.tasks} tasks`}
              >
                <span className={styles.quadrantLabel}>{QUADRANT_META[q].label}</span>
                <span className={styles.quadrantValue}>{pct}%</span>
                <span className={styles.quadrantSub}>
                  {byHours ? hoursText(share.minutes) : `${share.tasks} ${share.tasks === 1 ? 'task' : 'tasks'}`}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.donutWrap}>
          <PieChart responsive style={{ width: '100%', height: 200 }}>
            <Pie
              data={mix.shares.map((s) => ({
                name: QUADRANT_META[s.quadrant].label,
                quadrant: s.quadrant,
                value: byHours ? Math.round(s.minutes) : s.tasks,
              }))}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              onClick={(entry: { payload?: { quadrant?: Quadrant } }) => entry?.payload?.quadrant && onPick(entry.payload.quadrant)}
            >
              {mix.shares.map((s) => (
                <Cell key={s.quadrant} fill={QUADRANT_META[s.quadrant].color} />
              ))}
            </Pie>
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, name) => [byHours ? hoursText(Number(value)) : `${value} tasks`, name]}
            />
          </PieChart>
          <Legend items={mix.shares.map((s) => ({ label: `${QUADRANT_META[s.quadrant].label} ${Math.round((byHours ? s.hourShare : s.taskShare) * 100)}%`, color: QUADRANT_META[s.quadrant].color }))} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Productive hours

export function ProductiveHours({
  counts,
  top,
  onPickHour,
}: {
  counts: number[];
  top: number[];
  onPickHour: (hour: number) => void;
}) {
  // Trim the quiet night hours unless something was finished then.
  const firstHour = Math.min(6, counts.findIndex((c) => c > 0));
  const lastHour = Math.max(22, 23 - [...counts].reverse().findIndex((c) => c > 0));
  const rows = counts
    .map((count, hour) => ({ hour, count, label: String(hour).padStart(2, '0'), top: top.includes(hour) }))
    .filter((r) => r.hour >= Math.max(0, firstHour) && r.hour <= lastHour);
  return (
    <>
      <BarChart
        responsive
        style={{ width: '100%', height: 170 }}
        data={rows}
        margin={{ top: 8, right: 4, bottom: 0, left: -28 }}
        onClick={(state) => {
          const i = tappedIndex(state);
          if (i !== null && rows[i]) onPickHour(rows[i].hour);
        }}
      >
        <CartesianGrid vertical={false} stroke="var(--i-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={2} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label) => `${label}:00`} formatter={(value) => [value, 'Completed']} />
        <Bar dataKey="count" name="Completed" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.hour} fill={r.top ? 'var(--i-done)' : 'var(--i-planned)'} />
          ))}
        </Bar>
      </BarChart>
      <Legend
        items={[
          { label: 'Top 3 hours', color: 'var(--i-done)' },
          { label: 'Other hours', color: 'var(--i-planned)' },
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Recurring consistency

const CELL_TEXT = { done: 'done', missed: 'missed', none: 'not due', upcoming: 'still to come' } as const;

export function RecurringHeatmaps({ series, onOpen }: { series: SeriesConsistency[]; onOpen: (seriesId: string) => void }) {
  return (
    <div className={styles.heatmaps}>
      {series.map((s) => {
        // GitHub-style: one column per week (Monday on top) once it's over a week.
        const long = s.cells.length > 7;
        const lead = long ? (s.cells[0].date.getDay() + 6) % 7 : 0;
        return (
          <button key={s.seriesId} type="button" className={styles.heatmap} onClick={() => onOpen(s.seriesId)}>
            <span className={styles.heatmapHead}>
              <span className={styles.heatmapTitle}>{s.title}</span>
              <span className={styles.heatmapStats}>
                {s.consistency === null ? '' : `${Math.round(s.consistency * 100)}%`} · {s.streak}-day streak
              </span>
            </span>
            <span className={styles.heatGrid} data-long={long || undefined} aria-hidden>
              {Array.from({ length: lead }, (_, i) => (
                <span key={`lead-${i}`} className={styles.heatCell} data-state="pad" />
              ))}
              {s.cells.map((c) => (
                <span
                  key={c.key}
                  className={styles.heatCell}
                  data-state={c.state}
                  title={`${fullDay(c.date)}: ${CELL_TEXT[c.state]}`}
                />
              ))}
            </span>
            <span className={styles.srOnly}>
              {s.title}: done {s.done} of {s.due} times
            </span>
          </button>
        );
      })}
      <ul className={styles.legend}>
        <li>
          <span className={styles.heatCell} data-state="done" aria-hidden /> Done
        </li>
        <li>
          <span className={styles.heatCell} data-state="missed" aria-hidden /> Missed
        </li>
        <li>
          <span className={styles.heatCell} data-state="upcoming" aria-hidden /> To come
        </li>
        <li>
          <span className={styles.heatCell} data-state="none" aria-hidden /> Not due
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Estimate accuracy — a half gauge from 0.5x to 2x, "on plan" in the middle.

export function EstimateGauge({ accuracy }: { accuracy: EstimateAccuracy }) {
  const ratio = accuracy.ratio ?? 1;
  const min = 0.5;
  const max = 2;
  const clamped = Math.min(max, Math.max(min, ratio));
  // Log scale so 0.5x and 2x sit symmetrically around 1x.
  const t = (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
  const angle = Math.PI * (1 - t);
  const cx = 110;
  const cy = 104;
  const r = 84;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const nx = cx + (r - 18) * Math.cos(angle);
  const ny = cy - (r - 18) * Math.sin(angle);
  const tone = Math.abs(ratio - 1) < 0.1 ? 'good' : Math.abs(ratio - 1) < 0.35 ? 'watch' : 'bad';
  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 220 124" role="img" aria-label={`Actual time is ${ratio.toFixed(2)} times the estimate`}>
        <path d={arc(0.02, 0.36)} stroke="var(--i-amber)" strokeWidth={16} fill="none" strokeLinecap="round" />
        <path d={arc(0.4, 0.6)} stroke="var(--i-done)" strokeWidth={16} fill="none" strokeLinecap="round" />
        <path d={arc(0.64, 0.98)} stroke="var(--i-cancel)" strokeWidth={16} fill="none" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--color-text-primary)" strokeWidth={4} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill="var(--color-text-primary)" />
        <text x={cx - r} y={cy + 18} textAnchor="middle" className={styles.gaugeTick}>
          0.5x
        </text>
        <text x={cx} y={14} textAnchor="middle" className={styles.gaugeTick}>
          1x
        </text>
        <text x={cx + r} y={cy + 18} textAnchor="middle" className={styles.gaugeTick}>
          2x
        </text>
      </svg>
      <p className={styles.gaugeValue} data-tone={tone}>
        {ratio.toFixed(1)}x
      </p>
      <p className={styles.gaugeSub}>
        {hoursText(accuracy.actualMinutes)} actual vs {hoursText(accuracy.estimatedMinutes)} planned · {accuracy.measured} of{' '}
        {accuracy.count} timed
      </p>
    </div>
  );
}
