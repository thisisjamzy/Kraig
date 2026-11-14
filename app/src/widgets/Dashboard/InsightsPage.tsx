'use client';

// Money Insights, level one (Design-System BUILD-KIT 5.3; Dreda.figcraft
// `Insights / Web` and `Insights / Phone`). In this order and nothing between:
// the verdict, up to three action cards, one chart, and a way down to the full
// breakdown (the dashboard, at /statistics/breakdown). Phone and web both
// render this, like DashboardPage; the phone passes its header height.

import Link from 'next/link';
import type { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { signedCompact } from '@/src/shared/dashboard/format';
import { ChartCard, GuideProvider } from '@/src/widgets/Charts/ChartCard';
import { DivergingColumnChart } from '@/src/widgets/Charts/Columns';
import charts from '@/src/widgets/Charts/Charts.module.css';
import { ActionCard } from '@/src/widgets/Insights/ActionCard';
import { VerdictCard } from '@/src/widgets/Insights/VerdictCard';
import { PeriodFilter } from './DashboardPage';
import s from './Dashboard.module.css';
import ip from './InsightsPage.module.css';

const UP = 'var(--color-data-positive)';
const DOWN = 'var(--color-data-negative)';

export function InsightsPage({ v, stickyTop = '0px', web = false }: { v: ReturnType<typeof useMoneyDashboard>; stickyTop?: string; web?: boolean }) {
  const { verdict } = v;
  return (
    <div className={`${s.root} ${charts.palette}`} data-web={web || undefined} style={{ ['--dash-top' as string]: stickyTop }}>
      <header className={s.head}>
        <h1 className={web ? s.title : s.pageTitle}>{web ? 'Where you stand' : 'Insights'}</h1>
        <PeriodFilter period={v.period} kind={v.kind} setKind={v.setKind} choices={v.choices} choose={v.choose} />
      </header>

      <div className={`${s.body} ${ip.body}`}>
        {!web && <h2 className={s.title}>Where you stand</h2>}
        <VerdictCard verdict={verdict} loading={v.loading} />

        {!v.loading && verdict.actions.length > 0 && (
          <section className={ip.worth} aria-labelledby="worth-doing-now">
            <h2 id="worth-doing-now" className={ip.overline}>
              Worth doing now
            </h2>
            <div className={ip.cards} data-count={verdict.actions.length}>
              {verdict.actions.map((card) => (
                <ActionCard key={card.kind} card={card} />
              ))}
            </div>
          </section>
        )}

        <GuideProvider resetKey={`${v.kind}-${v.period.start.getTime()}`}>
          <ChartCard
            title="Is it getting better?"
            subtitle="What you kept each period: income minus spending"
            chartType="diverging"
            legend={[
              { label: 'Kept', color: UP },
              { label: 'Short', color: DOWN },
            ]}
            insight={verdict.chart.caption}
            state={v.loading ? { status: 'loading' } : verdict.chart.points.some((p) => p.value !== null) ? { status: 'ready' } : { status: 'empty', text: 'Nothing recorded in this period yet.' }}
          >
            <DivergingColumnChart
              data={verdict.chart.points}
              format={signedCompact}
              tick={signedCompact}
              colors={{ up: UP, down: DOWN }}
              ariaLabel={`What you kept each period. ${verdict.chart.caption ?? ''}`}
            />
          </ChartCard>
        </GuideProvider>

        <section className={ip.more}>
          <div className={ip.moreCopy}>
            <h2 className={ip.moreTitle}>Want the detail?</h2>
            <p className={ip.moreText}>Where the balance went, where the income went, unplanned spending by category and by day, the forecast, and every reconciliation.</p>
          </div>
          <Link href="/statistics/breakdown" className={ip.moreButton}>
            See the full breakdown
          </Link>
        </section>
      </div>
    </div>
  );
}
