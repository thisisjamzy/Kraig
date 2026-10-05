'use client';

// Insights — progress at a glance and early warnings: an alerts strip
// (most severe first), four summary tiles against the previous period,
// seven chart cards, and active projects sorted by risk. The generic
// AppHeader is off on this route (chromeVisibility.ts) — this header, with
// the range selector, replaces it.

import Link from 'next/link';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Minus,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { useLogic } from '@/src/logic/insights/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import type { Tile } from '@/src/viewmodels/insights/compute';
import type { ProjectRisk, ProjectStat } from '@/src/viewmodels/insights/metrics';
import type { RangeKind } from '@/src/viewmodels/insights/types';
import { shortDate } from '@/src/viewmodels/insights/dates';
import {
  ChartCard,
  CompletionTrend,
  DailyLoad,
  DayTimeline,
  EstimateGauge,
  PlannedVsDone,
  PriorityMix,
  ProductiveHours,
  RecurringHeatmaps,
} from '@/src/phone/screens/Insights/InsightCharts';
import { TopBarControls, useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { GridCard, PageGrid } from '@/src/phone/widgets/Layout/PageGrid';
import styles from '@/src/phone/screens/Insights/InsightsScreen.module.css';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';

const RANGES: { id: RangeKind; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'custom', label: 'Custom' },
];

export function InsightsScreen() {
  return <InsightsView {...useLogic()} />;
}

export function InsightsView({
  kind,
  setKind,
  custom,
  setCustom,
  result,
  settings,
  openTasks,
  open,
  loading,
}: ReturnType<typeof useLogic>) {
  // Medium screens and up: a dashboard grid (PageGrid), the range and
  // settings in the top bar, cards in the dashboard's reading order. The
  // phone keeps its order and markup — each card is built once below.
  const inShell = useHasTopBar();
  const ranges = (
    <div className={styles.ranges} role="radiogroup" aria-label="Date range">
      {RANGES.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={kind === r.id} onClick={() => setKind(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
  // Alerts most severe first; projects most at risk first.
  const cards = result && {
    alerts: (
      <p className={styles.neutral}>
        {result.alerts.length === 0 ? 'Nothing needs your attention right now.' : 'Your week at a glance.'}
        <NotificationsLink module="time" about="your time" />
      </p>
    ),
    tiles: (
      <div className={styles.tiles}>
        <SummaryTile label="Completion rate" tile={result.tiles.completion} percent onOpen={() => openTasks({ status: 'done', title: 'Completed' })} />
        <SummaryTile label="On time" tile={result.tiles.onTime} percent onOpen={() => openTasks({ status: 'done', title: 'Completed' })} />
        <SummaryTile label="Overdue" tile={result.tiles.overdue} onOpen={() => open('/tasks?filter=overdue')} lowerIsBetter />
        <SummaryTile label="Day streak" tile={result.tiles.streak} suffix={result.tiles.streak.value === 1 ? ' day' : ' days'} />
      </div>
    ),
    trend: (
      <ChartCard
        title="Completion trend"
        takeaway={result.completionTrend.takeaway}
        empty={result.completionTrend.empty}
        emptyText="Complete a few tasks to see your trend."
      >
        <CompletionTrend
          data={result.completionTrend.data}
          kind={kind}
          target={settings.thresholds.streakPercent}
          onPickDay={(date) => openTasks({ date })}
        />
      </ChartCard>
    ),
    planned: (
      <ChartCard
        title="Planned vs done"
        takeaway={result.plannedVsDone.takeaway}
        empty={result.plannedVsDone.empty}
        emptyText="Plan a few tasks to compare them with what gets done."
      >
        <PlannedVsDone data={result.plannedVsDone.data} kind={kind} onPickDay={(date) => openTasks({ date })} />
      </ChartCard>
    ),
    load: (
      <ChartCard
        title="Daily load"
        takeaway={result.dailyLoad.takeaway}
        empty={result.dailyLoad.empty}
        emptyText="Give your tasks a time to see how full your days are."
      >
        {kind === 'today' ? (
          <DayTimeline
            load={result.dailyLoad.data[0]}
            workStart={settings.workStart}
            workEnd={settings.workEnd}
            onOpen={(id) => open(`/tasks/${id}/edit`)}
          />
        ) : (
          <DailyLoad
            data={result.dailyLoad.data}
            kind={kind}
            capacityHours={settings.capacityHours}
            onPickDay={(date) => open(`/projects/calendar?date=${toKey(date)}`)}
          />
        )}
      </ChartCard>
    ),
    mix: (
      <ChartCard
        title="Priority mix"
        takeaway={result.priorityMix.takeaway}
        empty={result.priorityMix.empty}
        emptyText="Plan tasks to see where your time goes."
      >
        <PriorityMix mix={result.priorityMix.data} onPick={(quadrant) => openTasks({ quadrant })} />
      </ChartCard>
    ),
    productive: (
      <ChartCard
        title="Productive hours"
        takeaway={result.productiveHours.takeaway}
        empty={result.productiveHours.empty}
        emptyText="Complete a few tasks to find your most productive hours."
      >
        <ProductiveHours
          counts={result.productiveHours.data.counts}
          top={result.productiveHours.data.top}
          onPickHour={(hour) => openTasks({ hour, status: 'done', title: `Completed around ${String(hour).padStart(2, '0')}:00` })}
        />
      </ChartCard>
    ),
    recurring: (
      <ChartCard
        title="Recurring consistency"
        takeaway={result.recurring.takeaway}
        empty={result.recurring.empty}
        emptyText="Recurring tasks will show here once they are due."
      >
        <RecurringHeatmaps series={result.recurring.data} onOpen={(id) => open(`/tasks/${id}/edit`)} />
      </ChartCard>
    ),
    estimate: (
      <ChartCard
        title="Estimate accuracy"
        takeaway={result.estimate.takeaway}
        empty={result.estimate.empty}
        emptyText="Finish timed tasks to compare real time with your plans."
      >
        <EstimateGauge accuracy={result.estimate.data} />
      </ChartCard>
    ),
    projects: (
      <section className={styles.projects}>
        <h2 className={styles.sectionTitle}>Projects</h2>
        {result.projects.length === 0 ? (
          <p className={styles.emptyLine}>No active projects. Create one to track its progress here.</p>
        ) : (
          result.projects.map((stat) => <ProjectRiskCard key={stat.project.id} stat={stat} />)
        )}
      </section>
    ),
  };

  return (
    <div className={styles.page} data-shell={inShell || undefined}>
      {inShell ? (
        <TopBarControls>
          {/* The page's colour tokens, for the ranges up in the top bar. */}
          <div className={`${styles.topVars} ${styles.topRanges}`}>{ranges}</div>
          <Link href="/settings/insights" className={styles.iconLink} aria-label="Insights settings" title="Insights settings">
            <Settings2 size={20} strokeWidth={2} />
          </Link>
        </TopBarControls>
      ) : (
        <ScreenHeader
          sticky={false}
          large
          title="Insights"
          right={
            <Link href="/settings/insights" className={styles.iconLink} aria-label="Insights settings">
              <Settings2 size={20} strokeWidth={2} />
            </Link>
          }
        />
      )}

      {!inShell && ranges}
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

      {cards && !inShell && (
        <>
          {cards.alerts}
          {cards.tiles}
          {cards.trend}
          {cards.planned}
          {cards.load}
          {cards.mix}
          {cards.productive}
          {cards.recurring}
          {cards.estimate}
          {cards.projects}

          <Link href="/projects/analytics" className={styles.moreLink}>
            Area and reschedule stats
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </>
      )}

      {cards && inShell && (
        <PageGrid>
          <GridCard size="Full">{cards.alerts}</GridCard>
          <GridCard size="Full">{cards.tiles}</GridCard>
          <GridCard size="XL" wideOnMedium>{cards.trend}</GridCard>
          <GridCard size="M" wideOnMedium>{cards.mix}</GridCard>
          <GridCard size="L">{cards.load}</GridCard>
          <GridCard size="L">{cards.productive}</GridCard>
          <GridCard size="L">{cards.recurring}</GridCard>
          <GridCard size="L">{cards.projects}</GridCard>
          <GridCard size="L">{cards.planned}</GridCard>
          <GridCard size="L">{cards.estimate}</GridCard>
          <GridCard size="Full">
            <Link href="/projects/analytics" className={styles.moreLink}>
              Area and reschedule stats
              <ChevronRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </GridCard>
        </PageGrid>
      )}
    </div>
  );
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function SummaryTile({
  label,
  tile,
  percent = false,
  suffix = '',
  lowerIsBetter = false,
  onOpen,
}: {
  label: string;
  tile: Tile;
  percent?: boolean;
  suffix?: string;
  lowerIsBetter?: boolean;
  onOpen?: () => void;
}) {
  const value = tile.value === null ? '' : percent ? `${Math.round(tile.value * 100)}%` : `${tile.value}${suffix}`;
  const change = tile.change;
  const Arrow = change === null || change === 0 ? Minus : change > 0 ? ArrowUp : ArrowDown;
  const changeText =
    // No chip when nothing moved.
    change === null || Math.round(change * (percent ? 100 : 1)) === 0
      ? null
      : percent
        ? `${Math.abs(Math.round(change * 100))} pts`
        : `${Math.abs(change)}`;
  const tone = tile.better === null ? 'flat' : tile.better ? 'better' : 'worse';
  const body = (
    <>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {changeText !== null && (
        <span className={styles.tileChange} data-tone={tone}>
          <Arrow size={12} strokeWidth={2.5} aria-hidden />
          {changeText}
          <span className={styles.srOnly}>
            {tone === 'flat' ? ' no change' : tone === 'better' ? ' better' : ' worse'} than the previous period
            {lowerIsBetter ? ' (lower is better)' : ''}
          </span>
        </span>
      )}
    </>
  );
  return onOpen ? (
    <button type="button" className={styles.tile} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={styles.tile}>{body}</div>
  );
}

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

function ProjectRiskCard({ stat }: { stat: ProjectStat }) {
  const { project } = stat;
  return (
    <Link href={`/projects/insights/${project.id}`} className={styles.projectCard}>
      <ProgressRing value={stat.progress} />
      <span className={styles.projectText}>
        <span className={styles.projectName}>
          <span className={styles.projectDot} style={{ background: project.color }} aria-hidden />
          {project.name}
        </span>
        <span className={styles.projectMeta}>
          {project.deadline ? `Due ${shortDate(project.deadline)}` : 'No deadline'} · {stat.done}/{stat.total} tasks
        </span>
        {stat.reasons[0] && <span className={styles.projectReason}>{stat.reasons[0]}</span>}
      </span>
      <RiskChip risk={stat.risk} />
    </Link>
  );
}
