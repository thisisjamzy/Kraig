'use client';

// Money Insights, one page (owner, 24 Nov 2026), for web and phone. The old
// "full breakdown" page is folded in (its old address forwards here):
//   1. the header row, sticky: "Insights" and the period filter (on a phone
//      one button that opens a sheet with both choices);
//   2. the section nav, sticky under it, chips that scroll sideways on a
//      phone and light up the section in view;
//   3. Overview: the verdict, "Worth doing now", the period hero and KPI
//      tiles, then "Is it getting better?" beside Accountability;
//   4. the period's breakdown sections (src/shared/dashboard/layouts.ts).
// One useMoneyDashboard() call feeds the whole page.

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { signedCompact } from '@/src/shared/dashboard/format';
import { DASH_KINDS, dateParam, KIND_LABEL, periodWords, type DashKind } from '@/src/shared/dashboard/period';
import { AccountabilityCard } from '@/src/widgets/Accountability/AccountabilityCard';
import { ChartCard, GuideProvider, KpiTile } from '@/src/widgets/Charts/ChartCard';
import { DivergingColumnChart } from '@/src/widgets/Charts/Columns';
import charts from '@/src/widgets/Charts/Charts.module.css';
import { ActionCard } from '@/src/widgets/Insights/ActionCard';
import { VerdictCard } from '@/src/widgets/Insights/VerdictCard';
import { Modal } from '@/src/widgets/Modal/Modal';
import { PeriodFilter, sectionId } from './DashboardPage';
import { MoneyCardView, MoneyHeroCard } from './MoneyCards';
import s from './Dashboard.module.css';
import ip from './InsightsPage.module.css';

const UP = 'var(--color-data-positive)';
const DOWN = 'var(--color-data-negative)';

const NAV: { section: string; label: string }[] = [
  { section: 'Overview', label: 'Overview' },
  { section: 'Income', label: 'Income' },
  { section: 'Trends', label: 'Trends' },
  { section: 'Cash flow', label: 'Cash flow' },
  { section: 'Plan and debts', label: 'Plan and debts' },
  { section: 'Spending and debts', label: 'Spending and debts' },
  { section: 'Unplanned spending', label: 'Unplanned spending' },
  { section: 'Untracked money', label: 'Untracked money' },
  { section: 'Forecast', label: 'Forecast' },
];

/** The section in view, for the nav (IntersectionObserver). */
function useSectionInView(ids: string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = ids.find((id) => seen.get(id));
        if (first) setCurrent(first);
      },
      { rootMargin: '-120px 0px -60% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return current;
}

/** On a phone, the two period choices in one button and a sheet. */
function PhonePeriod({ v }: { v: ReturnType<typeof useMoneyDashboard> }) {
  const [open, setOpen] = useState(false);
  const current = v.choices.find((c) => c.value === dateParam(v.period.start))?.label ?? KIND_LABEL[v.kind];
  return (
    <>
      <button type="button" className={s.periodButton} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span>{v.kind === 'all' ? KIND_LABEL.all : current}</span>
        <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
      </button>
      {open && (
        <Modal title="Period" onClose={() => setOpen(false)} sheet>
          <div className={s.periodSheet}>
            <label>
              <span>Kind of period</span>
              <select value={v.kind} onChange={(e) => v.setKind(e.target.value as DashKind)}>
                {DASH_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {v.kind !== 'all' && (
              <label>
                <span>Which one</span>
                <select value={dateParam(v.period.start)} onChange={(e) => v.choose(e.target.value)}>
                  {v.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className={s.periodDone} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function MoneyInsightsPage({ v, stickyTop = '0px', web = false }: { v: ReturnType<typeof useMoneyDashboard>; stickyTop?: string; web?: boolean }) {
  const { verdict } = v;
  const words = periodWords(v.period, 'money');
  const sections = ['Overview', ...v.layout.flatMap((e) => ('section' in e ? [e.section] : []))];
  const nav = NAV.filter((n) => sections.includes(n.section));
  const inView = useSectionInView(nav.map((n) => sectionId(n.section)));

  return (
    <div className={`${s.root} ${charts.palette}`} data-web={web || undefined} style={{ ['--dash-top' as string]: stickyTop }}>
      <header className={s.head}>
        <h1 className={web ? s.title : s.pageTitle}>Insights</h1>
        {web ? <PeriodFilter period={v.period} kind={v.kind} setKind={v.setKind} choices={v.choices} choose={v.choose} /> : <PhonePeriod v={v} />}
      </header>
      <nav className={s.sectionNav} aria-label="Sections" style={{ ['--nav-top' as string]: stickyTop }}>
        {nav.map((n) => {
          const id = sectionId(n.section);
          return (
            <a key={n.section} href={`#${id}`} aria-current={inView === id ? 'location' : undefined}>
              {n.label}
            </a>
          );
        })}
      </nav>

      <div className={s.body}>
        <GuideProvider resetKey={`${v.kind}-${v.period.start.getTime()}`}>
          <div className={s.grid}>
            <h2 id={sectionId('Overview')} className={s.section}>
              Overview
            </h2>
            <div style={{ ['--span' as string]: 12 }}>
              <p className={s.subtitle}>{words.subtitle}</p>
              <VerdictCard verdict={verdict} loading={v.loading} />
            </div>
            {!v.loading && verdict.actions.length > 0 && (
              <section className={ip.worth} style={{ ['--span' as string]: 12 }} aria-labelledby="worth-doing-now">
                <h3 id="worth-doing-now" className={ip.overline}>
                  Worth doing now
                </h3>
                <div className={ip.cards} data-count={verdict.actions.length}>
                  {verdict.actions.map((card) => (
                    <ActionCard key={card.kind} card={card} />
                  ))}
                </div>
              </section>
            )}
            <div style={{ ['--span' as string]: 4 }}>
              <MoneyHeroCard hero={v.dash.hero} />
            </div>
            <div className={s.kpis} style={{ ['--span' as string]: 8 }}>
              {v.dash.kpis.map((k) => (
                <KpiTile key={k.label} kpi={v.loading ? { ...k, value: '…', pill: null, sub: undefined } : k} />
              ))}
            </div>
            <div style={{ ['--span' as string]: 6 }}>
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
            </div>
            <div id="section-accountability" style={{ ['--span' as string]: 6 }}>
              <AccountabilityCard />
            </div>

            {v.layout.map((entry, i) =>
              'section' in entry ? (
                <h2 key={`s-${entry.section}-${i}`} id={sectionId(entry.section)} className={s.section}>
                  {entry.section}
                </h2>
              ) : (
                <div key={entry.card} style={{ ['--span' as string]: entry.span }}>
                  <MoneyCardView key={`${entry.card}-${v.kind}`} card={v.dash.cards[entry.card as keyof typeof v.dash.cards]} loading={v.loading} />
                </div>
              )
            )}
          </div>
        </GuideProvider>
      </div>
    </div>
  );
}
