'use client';

// Time Insights: a Notion page.
//   Properties: Period (Today, Week, Month, Custom) and Compare to.
//   "Needs attention": the alerts as a compact callout, one line per group
//   ("21 overdue tasks, 19 in Do first", "7 projects at risk: nothing done
//   lately"), up to 5 lines (3 on phones), then "Show all".
//   Summary: Completion rate, On time, Overdue, Streak; a short phrase when
//   there's nothing to measure, never a bare dash.
//   Chart blocks in the staggered grid (as Money Insights): 3 columns from
//   1500px of content, 2 from 900px, 1 below; each can go wide, hide, or
//   move by dragging; the layout is remembered on this device.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowUp, ChartNoAxesCombined, CheckCircle2, ChevronDown, Settings2, type LucideIcon } from 'lucide-react';
import { useLogic } from '@/src/logic/insights/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { attentionLines, type AttentionLine } from '@/src/viewmodels/insights/attention';
import type { Tile } from '@/src/viewmodels/insights/compute';
import type { ProjectRisk } from '@/src/viewmodels/insights/metrics';
import type { RangeKind } from '@/src/viewmodels/insights/types';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
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
  const compact = useLayout().deviceClass === 'compact';
  const [allLines, setAllLines] = useState(false);
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

  const lines = result ? attentionLines(result.alerts, result.projects, { total: result.tiles.overdue.value ?? 0, doFirst: result.overdueDoFirst }) : [];
  const limit = compact ? 3 : 5;
  const shownLines = allLines ? lines : lines.slice(0, limit);

  const blocks: { id: string; title: string; summary: string; empty: string | null; status?: BlockStatus; body: ReactNode }[] = result
    ? [
        {
          id: 'trend',
          title: 'Completion trend',
          summary: result.completionTrend.takeaway,
          empty: result.completionTrend.empty ? 'Complete a few tasks to see your trend.' : null,
          body: <CompletionTrend data={result.completionTrend.data} kind={kind} target={settings.thresholds.streakPercent} onPickDay={(date) => openTasks({ date })} />,
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
          body: <PlannedVsDone data={result.plannedVsDone.data} kind={kind} onPickDay={(date) => openTasks({ date })} />,
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
      actions={
        <Link href="/settings/insights" className={styles.settingsLink} aria-label="Insights settings" title="Insights settings">
          <Settings2 size={18} strokeWidth={2} />
        </Link>
      }
      properties={[
        {
          id: 'period',
          label: 'Period',
          edit: { type: 'select', value: kind, options: PERIODS, onSave: (v) => setKind(v as RangeKind) },
        },
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
          {lines.length > 0 ? (
            <Callout tone={lines[0].severity === 'red' ? 'bad' : 'watch'} icon={<AlertTriangle size={18} strokeWidth={2} />}>
              <p className={styles.attentionTitle}>Needs attention</p>
              <ul className={styles.attention}>
                {shownLines.map((line) => (
                  <AttentionRow key={line.id} line={line} />
                ))}
              </ul>
              {lines.length > limit && (
                <button type="button" className={styles.textButton} onClick={() => setAllLines((a) => !a)}>
                  {allLines ? 'Show less' : `Show all ${lines.length}`}
                </button>
              )}
            </Callout>
          ) : (
            <Callout tone="good" icon={<CheckCircle2 size={18} strokeWidth={2} />}>
              <p>All clear: no overloaded days, overdue tasks or late projects.</p>
            </Callout>
          )}

          <div className={styles.summary}>
            <SummaryBlock label="Completion rate" tile={result.tiles.completion} percent emptyText="No tasks due yet" compareWith={result.compareWith} onOpen={() => openTasks({ status: 'done', title: 'Completed' })} />
            <SummaryBlock label="On time" tile={result.tiles.onTime} percent emptyText="Nothing finished yet" compareWith={result.compareWith} onOpen={() => openTasks({ status: 'done', title: 'Completed' })} />
            <SummaryBlock label="Overdue" tile={result.tiles.overdue} emptyText="Nothing overdue" lowerIsBetter compareWith={result.compareWith} onOpen={() => open('/projects/focus?view=overdue')} />
            <SummaryBlock label="Streak" tile={result.tiles.streak} suffix={result.tiles.streak.value === 1 ? ' day' : ' days'} emptyText="No streak yet" compareWith={result.compareWith} />
          </div>

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

function AttentionRow({ line }: { line: AttentionLine }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-severity={line.severity}>
      {line.items.length > 0 ? (
        <>
          <button type="button" className={styles.attentionToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <ChevronDown size={14} strokeWidth={2.25} aria-hidden style={{ transform: open ? undefined : 'rotate(-90deg)' }} />
            {line.text}
          </button>
          {open && (
            <ul className={styles.attentionItems}>
              {line.items.map((item) => (
                <li key={item.href + item.label}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : line.href ? (
        <Link href={line.href}>{line.text}</Link>
      ) : (
        line.text
      )}
    </li>
  );
}

function SummaryBlock({
  label,
  tile,
  percent = false,
  suffix = '',
  lowerIsBetter = false,
  emptyText,
  compareWith,
  onOpen,
}: {
  label: string;
  tile: Tile;
  percent?: boolean;
  suffix?: string;
  lowerIsBetter?: boolean;
  emptyText: string;
  compareWith: string;
  onOpen?: () => void;
}) {
  const value = tile.value === null ? null : percent ? `${Math.round(tile.value * 100)}%` : `${tile.value}${suffix}`;
  const change = tile.change;
  const rounded = change === null ? 0 : Math.round(change * (percent ? 100 : 1));
  const tone = tile.better === null ? 'flat' : tile.better ? 'better' : 'worse';
  const body = (
    <>
      <span className={styles.summaryLabel}>{label}</span>
      {value === null ? <span className={styles.summaryEmpty}>{emptyText}</span> : <span className={styles.summaryValue}>{value}</span>}
      {rounded !== 0 && (
        <span className={styles.summaryChange} data-tone={tone}>
          {rounded > 0 ? <ArrowUp size={12} strokeWidth={2.5} aria-hidden /> : <ArrowDown size={12} strokeWidth={2.5} aria-hidden />}
          {Math.abs(rounded)}
          {percent ? ' pts' : ''} vs {compareWith}
          {lowerIsBetter && <span className={styles.srOnly}> (lower is better)</span>}
        </span>
      )}
    </>
  );
  return onOpen ? (
    <button type="button" className={styles.summaryBlock} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={styles.summaryBlock}>{body}</div>
  );
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
