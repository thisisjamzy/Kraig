'use client';

// Renders one Money card from its view model (src/viewmodels/dashboard/
// money.ts) with the chart kit. Every chart with a scale has its own
// Linear / Log switch.

import { useState } from 'react';
import { amount, compact, signedCompact } from '@/src/shared/dashboard/format';
import type { ScaleMode } from '@/src/shared/dashboard/scale';
import type { MoneyCard } from '@/src/viewmodels/dashboard/money';
import { ChartCard, HeroCard } from '@/src/widgets/Charts/ChartCard';
import { ColumnChart, DivergingColumnChart, PairedColumnChart } from '@/src/widgets/Charts/Columns';
import { LineChart } from '@/src/widgets/Charts/Lines';
import { BulletList, HorizontalWaterfall, RankedBars, ReconciliationList, ReconciliationLog, StackedBarList, TransactionList } from '@/src/widgets/Charts/Lists';
import { BoxPlot, Sankey, Treemap } from '@/src/widgets/Charts/Shapes';
import { CalendarHeatmap, MatrixHeatmap } from '@/src/widgets/Charts/Calendars';
import type { MoneyHero } from '@/src/viewmodels/dashboard/money';

const P = 'var(--c-primary)';
const A = 'var(--c-accent)';
const PD = 'var(--c-primary-dark)';

export function MoneyHeroCard({ hero }: { hero: MoneyHero }) {
  return <HeroCard label={hero.label} value={hero.value} sub={hero.sub} segments={hero.segments} format={compact} insight={hero.insight} />;
}

export function MoneyCardView({ card, loading }: { card: MoneyCard | undefined; loading: boolean }) {
  const [scale, setScale] = useState<ScaleMode>('linear');
  if (!card) return null;
  const base = {
    title: card.title,
    subtitle: card.subtitle,
    insight: card.insight,
    state: loading ? ({ status: 'loading' } as const) : card.empty ? ({ status: 'empty', text: card.empty } as const) : ({ status: 'ready' } as const),
  };
  const scaled = { scale, onScale: setScale };
  switch (card.id) {
    case 'dayHours':
      return (
        <ChartCard {...base} {...scaled} chartType="column" legend={[{ label: 'Spent', color: A }, { label: 'Later today', outline: true }]}>
          <ColumnChart data={card.data.map((d) => ({ ...d, color: A }))} mode={scale} format={compact} tick={compact} ariaLabel={`${card.title}: ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'dayTx':
      return (
        <ChartCard {...base} chartType="transactions">
          <TransactionList rows={card.rows} format={amount} />
        </ChartCard>
      );
    case 'incEach':
      return (
        <ChartCard {...base} {...scaled} chartType="column" legend={[{ label: 'At or above average', color: P }, { label: 'Below average', color: A }, { label: `Average ${compact(card.average)}`, line: true }]}>
          <ColumnChart
            data={card.data.map((d) => ({ label: d.label, value: d.value, color: d.above ? P : A }))}
            mode={scale}
            format={compact}
            tick={compact}
            // The legend names the average line: a label on it would sit on a bar.
            refs={card.average > 0 ? [{ value: card.average, label: '' }] : []}
            ariaLabel={`${card.title}. ${card.insight ?? ''}`}
          />
        </ChartCard>
      );
    case 'flow':
      return (
        <ChartCard {...base} {...scaled} chartType="paired" legend={[{ label: 'Earned', color: P }, { label: 'Borrowed', hatch: 'primary' }, { label: 'Spent', color: A }]}>
          <PairedColumnChart data={card.data} mode={scale} format={compact} tick={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'trend':
      return (
        <ChartCard {...base} {...scaled} chartType="line" legend={[{ label: 'Income', color: P }, { label: 'Spending', color: A }, ...(card.forecastFrom !== null ? [{ label: 'Forecast', line: true }] : [])]}>
          <LineChart
            labels={card.labels}
            series={[
              { name: 'Income', color: P, values: card.income, area: true, endDot: true },
              { name: 'Spending', color: A, values: card.spending, endDot: true },
            ]}
            forecastFrom={card.forecastFrom}
            mode={scale}
            tick={compact}
            format={compact}
            ariaLabel={`${card.title}. ${card.insight ?? ''}`}
          />
        </ChartCard>
      );
    case 'sav':
      return (
        <ChartCard {...base} {...scaled} chartType="area" legend={[{ label: 'Kept so far', color: P }, ...(card.goal ? [{ label: `Goal ${compact(card.goal)}`, line: true }] : [])]}>
          <LineChart
            labels={card.labels}
            series={[{ name: 'Kept', color: P, values: card.values, area: true, endDot: true }]}
            refs={card.goal ? [{ value: card.goal, label: `Goal ${compact(card.goal)}`, side: 'left' }] : []}
            mode={scale}
            tick={compact}
            format={compact}
            allowNegative
            ariaLabel={`${card.title}. ${card.insight ?? ''}`}
          />
        </ChartCard>
      );
    case 'wf':
      return (
        <ChartCard {...base} chartType="waterfall" legend={[{ label: 'Balance', color: PD }, { label: 'Money in', color: P }, { label: 'Money out', color: A }, { label: 'Untracked', hatch: 'accent' }]}>
          <HorizontalWaterfall steps={card.steps} format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'sk':
      return (
        <ChartCard {...base} chartType="sankey">
          <Sankey sources={card.sources} uses={card.uses} format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'plan':
      return (
        <ChartCard {...base} chartType="bullet" legend={[{ label: 'Within plan', color: P }, { label: 'Over plan', color: A }, { label: 'Plan', color: 'var(--c-text)' }]}>
          <BulletList rows={card.rows} format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'box':
      return (
        <ChartCard {...base} {...scaled} chartType="boxplot">
          <BoxPlot groups={card.groups} mode={scale} format={compact} tick={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'debts':
      return (
        <ChartCard {...base} chartType="debts" legend={[{ label: 'Paid', color: P }, { label: 'Left', color: 'var(--c-grid)' }]}>
          <StackedBarList rows={card.rows} format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'tree':
      return (
        <ChartCard {...base} chartType="treemap">
          <Treemap parts={card.parts} format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'when':
      return (
        <ChartCard {...base} chartType={card.view === 'calendar' ? 'calendar' : 'heatmap'}>
          {card.view === 'calendar' ? (
            <CalendarHeatmap days={card.days} tone="accent" format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
          ) : (
            <MatrixHeatmap columns={card.columns} rows={card.rows} tone="accent" format={compact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
          )}
        </ChartCard>
      );
    case 'fc':
      return (
        <ChartCard {...base} {...scaled} chartType="line" legend={[{ label: 'Projected balance', color: PD }]}>
          <LineChart
            labels={card.labels}
            series={[{ name: 'Balance', color: PD, values: card.balance, endDot: true }]}
            forecastFrom={card.forecastFrom}
            mode={scale}
            tick={compact}
            format={compact}
            allowNegative
            ariaLabel={`${card.title}. ${card.insight ?? ''}`}
          />
          <ForecastTable rows={card.table} />
        </ChartCard>
      );
    case 'recEach':
      return (
        <ChartCard {...base} chartType="diverging" legend={[{ label: 'Missing', color: A }, { label: 'Found', color: P }]}>
          <DivergingColumnChart data={card.data} format={signedCompact} tick={signedCompact} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'recRate':
      return (
        <ChartCard {...base} {...scaled} chartType="rate" legend={[{ label: 'At or under target', color: P }, { label: 'Above target', color: A }, { label: `Target ${card.target}%`, line: true }]}>
          <LineChart
            labels={card.labels}
            series={[{ name: 'Untracked share', color: PD, values: card.values, dots: card.dots }]}
            refs={[{ value: card.target, label: `Target ${card.target}%`, side: 'left' }]}
            mode={scale}
            tick={(n) => `${n}%`}
            format={(n) => `${n}%`}
            ariaLabel={`${card.title}. ${card.insight ?? ''}`}
          />
        </ChartCard>
      );
    case 'recWallet':
      return (
        <ChartCard {...base} {...scaled} chartType="walletBars">
          <RankedBars rows={card.rows} mode={scale} format={compact} color={A} ariaLabel={`${card.title}. ${card.insight ?? ''}`} />
        </ChartCard>
      );
    case 'recLatest':
      return (
        <ChartCard {...base} chartType="reconciliation">
          <ReconciliationList rows={card.rows} format={amount} href="/settings/reconciliation" />
        </ChartCard>
      );
    case 'recLog':
      return (
        <ChartCard {...base} chartType="reconciliationLog">
          <ReconciliationLog rows={card.rows} format={amount} />
        </ChartCard>
      );
  }
}

function ForecastTable({ rows }: { rows: { label: string; income: number; spending: number; balance: number }[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            {['Period', 'Money in', 'Money out', 'Balance'].map((h, i) => (
              <th key={h} style={{ padding: '6px 8px', textAlign: i ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)', borderBottom: '1px solid var(--c-border)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ padding: 8, borderBottom: '1px solid var(--c-grid)' }}>{r.label}</td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--c-grid)', textAlign: 'right' }}>{amount(r.income)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--c-grid)', textAlign: 'right' }}>{amount(r.spending)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid var(--c-grid)', textAlign: 'right', fontWeight: 600, color: r.balance < 0 ? 'var(--c-bad)' : undefined }}>{amount(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
