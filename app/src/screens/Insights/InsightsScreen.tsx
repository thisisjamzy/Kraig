'use client';

// Time Insights: a Notion page.
//   Properties: Period (Today, Week, Month, Custom) and Compare to.
//   A neutral callout with the period in one sentence and a link to the
//   Time updates in Notifications (alerts live there, batched).
//   Summary: Completion rate, On time, Overdue, Streak; a short phrase when
//   there's nothing to measure, never a bare dash.
//   Chart blocks in the staggered grid (as Money Insights): 3 columns from
//   1500px of content, 2 from 900px, 1 below; each can go wide, hide, or
//   move by dragging; the layout is remembered on this device.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Activity, AlertOctagon, AlertTriangle, ChartNoAxesCombined, CheckCircle2, type LucideIcon } from 'lucide-react';
import { useLogic } from '@/src/logic/insights/useLogic';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';
import type { Tile } from '@/src/viewmodels/insights/compute';
import type { ProjectRisk } from '@/src/viewmodels/insights/metrics';
import type { RangeKind } from '@/src/viewmodels/insights/types';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import type { Property } from '@/src/widgets/Database/PropertiesBlock';
import { ChartBlock, type BlockStatus } from '@/src/widgets/Database/ChartBlock';
import { MasonryGrid } from '@/src/widgets/Database/MasonryGrid';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Tag, type TagColor } from '@/src/widgets/TaskDb/Tag';
import { CompletionTrend, DailyLoad, DayTimeline, EstimateGauge, PlannedVsDone, PriorityMix, ProductiveHours, RecurringHeatmaps } from './InsightCharts';
import styles from './InsightsScreen.module.css';

const PERIODS: { value: RangeKind; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

const LAYOUT_KEY = 'dreda.timeInsights.blocks';
interface BlockLayout {
  order: string[];
  hidden: string[];
  wide: string[];
}
const DEFAULT_LAYOUT: BlockLayout = { order: [], hidden: [], wide: ['trend'] };

const RISK_COLOR: Record<ProjectRisk, TagColor> = { done: 'gray', 'on track': 'green', watch: 'yellow', 'at risk': 'red', overdue: 'red' };
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function InsightsScreen() {
  const { kind, setKind, custom, setCustom, result, settings, openTasks, open, loading } = useLogic();
  const [layout, setLayout] = useState<BlockLayout>(DEFAULT_LAYOUT);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
        if (saved?.order) setLayout(saved);
      } catch {
        // Not remembered.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function save(next: BlockLayout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // Not remembered.
    }
  }


  const blocks: { id: string; title: string; summary: string; empty: string | null; status?: BlockStatus; body: ReactNode }[] = result
    ? [
        {
          id: 'trend',
          title: 'Completion trend',
          summary: result.completionTrend.takeaway,
          empty: result.completionTrend.empty ? 'Complete a few tasks to see your trend.' : null,
          body: <CompletionTrend data={fromFirstData(result.completionTrend.data)} kind={kind} target={settings.thresholds.streakPercent} onPickDay={(date) => openTasks({ date })} />,
        },
        {
          id: 'mix',
          title: 'Priority mix',
          summary: result.priorityMix.takeaway,
          empty: result.priorityMix.empty ? 'Plan tasks to see where your time goes.' : null,
          body: <PriorityMix mix={result.priorityMix.data} onPick={(quadrant) => openTasks({ quadrant })} />,
        },
        {
          id: 'load',
          title: 'Daily load',
          summary: result.dailyLoad.takeaway,
          empty: result.dailyLoad.empty ? 'Give your tasks a time to see how full your days are.' : null,
          body:
            kind === 'today' ? (
              <DayTimeline load={result.dailyLoad.data[0]} workStart={settings.workStart} workEnd={settings.workEnd} onOpen={(id) => open(`/tasks/${id}/edit`)} />
            ) : (
              <DailyLoad data={result.dailyLoad.data} kind={kind} capacityHours={settings.capacityHours} onPickDay={(date) => open(`/projects/calendar?date=${toKey(date)}`)} />
            ),
        },
        {
          id: 'planned',
          title: 'Planned vs done',
          summary: result.plannedVsDone.takeaway,
          empty: result.plannedVsDone.empty ? 'Plan a few tasks to compare them with what gets done.' : null,
          body: <PlannedVsDone data={fromFirstData(result.plannedVsDone.data)} kind={kind} onPickDay={(date) => openTasks({ date })} />,
        },
        {
          id: 'productive',
          title: 'Productive hours',
          summary: result.productiveHours.takeaway,
          empty: result.productiveHours.empty ? 'Complete a few tasks to find your most productive hours.' : null,
          body: (
            <ProductiveHours
              counts={result.productiveHours.data.counts}
              top={result.productiveHours.data.top}
              onPickHour={(hour) => openTasks({ hour, status: 'done', title: `Completed around ${String(hour).padStart(2, '0')}:00` })}
            />
          ),
        },
        {
          id: 'recurring',
          title: 'Recurring consistency',
          summary: result.recurring.takeaway,
          empty: result.recurring.empty ? 'Recurring tasks will show here once they are due.' : null,
          body: <RecurringHeatmaps series={result.recurring.data} onOpen={(id) => open(`/tasks/${id}/edit`)} />,
        },
        {
          id: 'estimate',
          title: 'Estimate accuracy',
          summary: result.estimate.takeaway,
          empty: result.estimate.empty ? 'Finish timed tasks to compare real time with your plans.' : null,
          body: <EstimateGauge accuracy={result.estimate.data} />,
        },
        {
          id: 'projects',
          title: 'Projects by risk',
          summary: result.projects.length ? `${result.projects.filter((p) => p.risk === 'at risk' || p.risk === 'overdue').length} of ${result.projects.length} active projects need attention.` : 'No active projects.',
          empty: result.projects.length ? null : 'Create a project to track its progress here.',
          body: (
            <ul className={styles.riskList}>
              {result.projects.map((stat) => (
                <li key={stat.project.id}>
                  <Link href={`/projects/${stat.project.id}`} className={styles.riskRow}>
                    <span className={styles.projectDot} style={{ background: stat.project.color }} aria-hidden />
                    <span className={styles.riskName}>{stat.project.name}</span>
                    <span className={styles.riskMeta}>{Math.round(stat.progress * 100)}%</span>
                    <Tag color={RISK_COLOR[stat.risk]}>{sentence(stat.risk)}</Tag>
                  </Link>
                </li>
              ))}
            </ul>
          ),
        },
      ]
    : [];

  const order = [...layout.order.filter((id) => blocks.some((b) => b.id === id)), ...blocks.map((b) => b.id).filter((id) => !layout.order.includes(id))];
  const shown = order.map((id) => blocks.find((b) => b.id === id)!).filter((b) => !layout.hidden.includes(b.id));
  function move(target: string) {
    if (!dragging || dragging === target) return;
    const next = order.filter((id) => id !== dragging);
    next.splice(next.indexOf(target), 0, dragging);
    save({ ...layout, order: next });
    setDragging(null);
  }

  return (
    <NotionPage
      title="Insights"
      icon={<ChartNoAxesCombined strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Insights', href: '/projects/insights' }]}
      menu={[{ label: 'Insights settings', href: '/settings/insights' }]}
      properties={[
        {
          id: 'period',
          label: 'Period',
          edit: { type: 'select', value: kind, options: PERIODS, onSave: (v) => setKind(v as RangeKind) },
        },
        ...(result
          ? ([
              { id: 'completed', label: 'Completed', tone: 'good', display: String(result.counts.completed) },
              { id: 'overdue', label: 'Overdue', tone: result.counts.overdue ? 'bad' : 'neutral', display: result.counts.overdue ? <Link href="/projects/focus?view=overdue">{result.counts.overdue}</Link> : '0' },
              { id: 'dueToday', label: 'Due today', tone: 'in', display: String(result.counts.dueToday) },
              { id: 'rescheduled', label: 'Rescheduled', tone: result.counts.rescheduled ? 'watch' : 'neutral', display: String(result.counts.rescheduled) },
              {
                id: 'completion',
                label: 'Completion rate',
                display: result.tiles.completion.value === null ? 'No tasks due yet' : `${Math.round(result.tiles.completion.value * 100)}%`,
                sub: changeText(result.tiles.completion, true, result.compareWith),
              },
              {
                id: 'onTime',
                label: 'On time',
                display: result.tiles.onTime.value === null ? 'Nothing finished yet' : `${Math.round(result.tiles.onTime.value * 100)}%`,
                sub: changeText(result.tiles.onTime, true, result.compareWith),
              },
              { id: 'streak', label: 'Streak', display: result.tiles.streak.value ? `${result.tiles.streak.value} ${result.tiles.streak.value === 1 ? 'day' : 'days'}` : 'No streak yet' },
            ] as Property[])
          : []),
        { id: 'compare', label: 'Compare to', display: result ? sentence(result.compareWith) : 'Previous period' },
      ]}
    >
      {kind === 'custom' && custom && (
        <div className={styles.customRange}>
          <label>
            From
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
          </label>
          <label>
            To
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
          </label>
        </div>
      )}
      <ScreenState loading={loading} />
      {result && (
        <>
          <Callout icon={<Activity size={18} strokeWidth={2} />}>
            <p>
              {result.counts.completed} {result.counts.completed === 1 ? 'task' : 'tasks'} done, {result.counts.dueToday} due today and {result.counts.overdue} overdue.
              <NotificationsLink module="time" about="your time" />
            </p>
          </Callout>

          <div className={styles.tokens}>
            <MasonryGrid
              label="Insights"
              items={shown.map((b) => ({
                id: b.id,
                span: layout.wide.includes(b.id) ? 2 : 1,
                node: (
                  <ChartBlock
                    id={b.id}
                    title={b.title}
                    status={b.status}
                    summary={b.summary}
                    empty={b.empty}
                    wide={layout.wide.includes(b.id)}
                    onToggleWide={() => save({ ...layout, order, wide: layout.wide.includes(b.id) ? layout.wide.filter((x) => x !== b.id) : [...layout.wide, b.id] })}
                    onHide={() => save({ ...layout, order, hidden: [...layout.hidden, b.id] })}
                    onDragStart={setDragging}
                    onDrop={move}
                  >
                    {b.body}
                  </ChartBlock>
                ),
              }))}
            />
          </div>
          {layout.hidden.length > 0 && (
            <button type="button" className={styles.textButton} onClick={() => save({ ...layout, hidden: [] })}>
              Show {layout.hidden.length} hidden {layout.hidden.length === 1 ? 'block' : 'blocks'}
            </button>
          )}
          <Link href="/projects/analytics" className={styles.moreLink}>
            Area and reschedule stats
          </Link>
        </>
      )}
    </NotionPage>
  );
}


/** "+5 pts vs last week" for a rate tile, or nothing. */
function changeText(tile: Tile, percent: boolean, compareWith: string): string | undefined {
  if (tile.change === null) return undefined;
  const n = Math.round(tile.change * (percent ? 100 : 1));
  if (n === 0) return `Same as ${compareWith}`;
  return `${n > 0 ? 'Up' : 'Down'} ${Math.abs(n)}${percent ? ' pts' : ''} vs ${compareWith}`;
}

/** Charts start at the first day (or week) with data. */
function fromFirstData<T extends { planned: number; done: number; cancelled: number }>(days: T[]): T[] {
  const first = days.findIndex((d) => d.planned || d.done || d.cancelled);
  return first <= 0 ? days : days.slice(Math.min(first, Math.max(0, days.length - 2)));
}

// Shared with the project insights page.
const RISK_TEXT: Record<ProjectRisk, string> = {
  done: 'Done',
  'on track': 'On track',
  watch: 'Watch',
  'at risk': 'At risk',
  overdue: 'Overdue',
};
const RISK_ICON: Record<ProjectRisk, LucideIcon> = {
  done: CheckCircle2,
  'on track': CheckCircle2,
  watch: AlertTriangle,
  'at risk': AlertOctagon,
  overdue: AlertOctagon,
};

export function RiskChip({ risk }: { risk: ProjectRisk }) {
  const Icon = RISK_ICON[risk];
  return (
    <span className={styles.chip} data-risk={risk}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {RISK_TEXT[risk]}
    </span>
  );
}

export function ProgressRing({ value, size = 48, color }: { value: number; size?: number; color?: string }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--i-grid)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? 'var(--i-done)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.ringLabel}>{Math.round(value * 100)}%</span>
    </span>
  );
}
