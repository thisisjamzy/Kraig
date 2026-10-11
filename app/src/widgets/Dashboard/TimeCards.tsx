'use client';

// Renders one Time card from its view model (src/viewmodels/dashboard/
// time.ts) with the chart kit. Every chart with a scale has its own
// Linear / Log switch. Time is in minutes; labels read as hours.

import { useState } from 'react';
import { hours } from '@/src/shared/dashboard/format';
import type { ScaleMode } from '@/src/shared/dashboard/scale';
import { CATEGORY_COLOR, CATEGORY_LABEL, TIME_CATEGORIES, type TimeCard, type TimeDashboard } from '@/src/viewmodels/dashboard/time';
import { ChartCard, HeroCard } from '@/src/widgets/Charts/ChartCard';
import { ColumnChart, StackedColumnChart } from '@/src/widgets/Charts/Columns';
import { LineChart } from '@/src/widgets/Charts/Lines';
import { BulletList, RankedBars } from '@/src/widgets/Charts/Lists';
import { BoxPlot, Donut, Radar, Treemap } from '@/src/widgets/Charts/Shapes';
import { CalendarHeatmap, DayTimeline, Gantt, MatrixHeatmap, YearHeatmap } from '@/src/widgets/Charts/Calendars';

/** Axis ticks in hours. */
const hourTick = (minutes: number) => {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
};
const minutesText = (m: number) => `${Math.round(m)}`;

export function TimeHeroCard({ hero }: { hero: TimeDashboard['hero'] }) {
  return <HeroCard label={hero.label} value={hero.value} sub={hero.sub} segments={hero.segments} format={hours} insight={hero.insight} />;
}

export function TimeCardView({ card, loading }: { card: TimeCard | undefined; loading: boolean }) {
  const [scale, setScale] = useState<ScaleMode>('linear');
  if (!card) return null;
  const base = {
    title: card.title,
    subtitle: card.subtitle,
    insight: card.insight,
    state: loading ? ({ status: 'loading' } as const) : card.empty ? ({ status: 'empty', text: card.empty } as const) : ({ status: 'ready' } as const),
  };
  const scaled = { scale, onScale: setScale };
  const aria = `${card.title}. ${card.insight ?? ''}`;
  const categoryLegend = TIME_CATEGORIES.map((c) => ({ label: CATEGORY_LABEL[c], color: CATEGORY_COLOR[c] }));
  switch (card.id) {
    case 'dayline':
      return (
        <ChartCard {...base} chartType="dayTimeline" legend={[...categoryLegend, { label: 'Planned', outline: true }]}>
          <DayTimeline blocks={card.blocks} from={card.from} to={card.to} now={card.now} ariaLabel={aria} />
        </ChartCard>
      );
    case 'hoursEach':
      return (
        <ChartCard {...base} {...scaled} chartType="stacked" legend={[...categoryLegend, ...(card.target ? [{ label: `Target ${hours(card.target)}`, line: true }] : [])]}>
          <StackedColumnChart
            series={TIME_CATEGORIES.map((c) => ({ name: CATEGORY_LABEL[c], color: CATEGORY_COLOR[c] }))}
            data={card.data}
            mode={scale}
            format={hours}
            tick={hourTick}
            refs={card.target ? [{ value: card.target, label: `Target ${hours(card.target)}` }] : []}
            ariaLabel={aria}
          />
        </ChartCard>
      );
    case 'donut':
      return (
        <ChartCard {...base} chartType="donut">
          <Donut parts={card.parts} format={hours} centerLabel="tracked" ariaLabel={aria} />
        </ChartCard>
      );
    case 'heat':
      return (
        <ChartCard {...base} chartType="heatmap">
          <MatrixHeatmap columns={card.columns} rows={card.rows} tone="primary" format={minutesText} ariaLabel={aria} />
        </ChartCard>
      );
    case 'projects':
      return (
        <ChartCard {...base} {...scaled} chartType="bars">
          <RankedBars rows={card.rows} mode={scale} format={hours} ariaLabel={aria} />
        </ChartCard>
      );
    case 'plan':
      return (
        <ChartCard {...base} chartType="bullet" legend={[{ label: 'Within plan', color: 'var(--c-primary)' }, { label: 'Over plan', color: 'var(--c-accent)' }, { label: 'Plan', color: 'var(--c-text)' }]}>
          <BulletList rows={card.rows} format={hours} ariaLabel={aria} />
        </ChartCard>
      );
    case 'trend':
      return (
        <ChartCard
          {...base}
          {...scaled}
          chartType="line"
          legend={[{ label: 'Hours', color: 'var(--c-primary)' }, ...(card.target ? [{ label: `Target ${hours(card.target)}`, line: true }] : []), { label: `Average ${hours(card.average)}`, line: true }]}
        >
          <LineChart
            labels={card.labels}
            series={[{ name: 'Hours', color: 'var(--c-primary)', values: card.values, area: true, endDot: true }]}
            refs={[
              ...(card.target ? [{ value: card.target, label: `Target ${hours(card.target)}`, side: 'right' as const }] : []),
              ...(card.average ? [{ value: card.average, label: `Average ${hours(card.average)}`, side: 'left' as const, style: 'dotted' as const }] : []),
            ]}
            mode={scale}
            tick={hourTick}
            format={hours}
            ariaLabel={aria}
          />
        </ChartCard>
      );
    case 'gantt':
      return (
        <ChartCard {...base} chartType="gantt">
          <Gantt rows={card.rows} from={card.from} to={card.to} today={card.today} ariaLabel={aria} />
        </ChartCard>
      );
    case 'radar':
      return (
        <ChartCard {...base} chartType="radar" legend={[{ label: 'Actual', color: 'var(--c-primary)' }, { label: 'Target', line: true }]}>
          <Radar axes={card.axes} ariaLabel={aria} />
        </ChartCard>
      );
    case 'hist':
      return (
        <ChartCard {...base} {...scaled} chartType="histogram">
          <ColumnChart data={card.data} mode={scale} histogram format={(n) => String(n)} tick={(n) => String(Math.round(n))} ariaLabel={aria} />
        </ChartCard>
      );
    case 'box':
      return (
        <ChartCard {...base} {...scaled} chartType="boxplot">
          <BoxPlot groups={card.groups} mode={scale} format={hours} tick={hourTick} ariaLabel={aria} />
        </ChartCard>
      );
    case 'tree':
      return (
        <ChartCard {...base} chartType="treemap">
          <Treemap parts={card.parts} format={hours} ariaLabel={aria} />
        </ChartCard>
      );
    case 'cal':
      return (
        <ChartCard {...base} chartType="calendar">
          {card.view === 'month' ? (
            <CalendarHeatmap days={card.days} tone="primary" format={hours} ariaLabel={aria} />
          ) : (
            <YearHeatmap days={card.days} tone="primary" format={hours} ariaLabel={aria} />
          )}
        </ChartCard>
      );
  }
}
