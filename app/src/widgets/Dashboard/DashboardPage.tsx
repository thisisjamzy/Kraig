'use client';

// The Money and Time dashboards' shared page (two separate pages): one
// header row fixed under the app's own header, the "Insights" title on the
// left and the filter on the right (two dropdowns: the kind of period, then
// the specific one), then the period's
// heading, the hero and KPI tiles, then the period's cards from its
// layout (src/shared/dashboard/layouts.ts). Phone and web both render this;
// the phone passes the height of its app header as `stickyTop`.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { dateParam, DASH_KINDS, KIND_LABEL, periodWords, type DashKind, type DashPeriod } from '@/src/shared/dashboard/period';
import type { LayoutEntry } from '@/src/shared/dashboard/layouts';
import { GuideProvider, KpiTile, type Kpi } from '@/src/widgets/Charts/ChartCard';
import charts from '@/src/widgets/Charts/Charts.module.css';
import s from './Dashboard.module.css';

export function DashboardPage({
  dashboard,
  period,
  kind,
  setKind,
  choices,
  choose,
  stickyTop = '0px',
  web = false,
  hero,
  kpis,
  layout,
  renderCard,
  loading,
  breakdown,
}: {
  dashboard: 'money' | 'time';
  period: DashPeriod;
  kind: DashKind;
  setKind: (k: DashKind) => void;
  /** The specific periods to pick from, newest first. */
  choices: { value: string; label: string }[];
  choose: (value: string) => void;
  stickyTop?: string;
  /** Web: no page background, and the big heading shares the fixed row with the filters (the top bar's breadcrumb names the page). Phone: "Insights" in the fixed row, the big heading below. */
  web?: boolean;
  hero: ReactNode;
  kpis: Kpi[];
  layout: LayoutEntry[];
  renderCard: (id: string, span: number) => ReactNode;
  loading: boolean;
  /** Insights level two (the full breakdown): a back link to the answer page,
   * the title, and a section nav that scrolls to the sections. */
  breakdown?: { back: string; title: string };
}) {
  const words = periodWords(period, dashboard);
  const sections = layout.flatMap((e) => ('section' in e ? [e.section] : []));
  const nav = breakdown ? BREAKDOWN_NAV.filter((n) => sections.includes(n.section)) : [];
  return (
    <div className={`${s.root} ${charts.palette}`} data-web={web || undefined} style={{ ['--dash-top' as string]: stickyTop }}>
      <header className={s.head}>
        {breakdown ? (
          <div className={s.breakdownTitles}>
            <Link href={breakdown.back} className={s.backLink}>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden />
              Insights
            </Link>
            <h1 className={web ? s.title : s.pageTitle}>{breakdown.title}</h1>
          </div>
        ) : web ? (
          <h1 className={s.title}>{words.title}</h1>
        ) : (
          <h1 className={s.pageTitle}>Insights</h1>
        )}
        <PeriodFilter period={period} kind={kind} setKind={setKind} choices={choices} choose={choose} />
      </header>
      {nav.length > 0 && (
        <nav className={s.sectionNav} aria-label="Sections">
          {nav.map((n) => (
            <a key={n.section} href={`#${sectionId(n.section)}`}>
              {n.label}
            </a>
          ))}
        </nav>
      )}

      <div className={s.body}>
        {!web && <h2 className={s.title}>{words.title}</h2>}
        <p className={s.subtitle}>{words.subtitle}</p>
        <GuideProvider resetKey={`${kind}-${period.start.getTime()}`}>
          <div className={s.grid}>
            <div style={{ ['--span' as string]: 4 }}>{hero}</div>
            <div className={s.kpis} style={{ ['--span' as string]: 8 }}>
              {kpis.map((k) => (
                <KpiTile key={k.label} kpi={loading ? { ...k, value: '…', pill: null, sub: undefined } : k} />
              ))}
            </div>
            {layout.map((entry, i) =>
              'section' in entry ? (
                <h2 key={`s-${entry.section}-${i}`} id={sectionId(entry.section)} className={s.section}>
                  {entry.section}
                </h2>
              ) : (
                <div key={entry.card} style={{ ['--span' as string]: entry.span }}>
                  {renderCard(entry.card, entry.span)}
                </div>
              )
            )}
          </div>
        </GuideProvider>
      </div>
    </div>
  );
}

const BREAKDOWN_NAV = [
  { section: 'Cash flow', label: 'Cash flow' },
  { section: 'Plan and debts', label: 'Plan and debts' },
  { section: 'Unplanned spending', label: 'Unplanned' },
  { section: 'Untracked money', label: 'Untracked' },
  { section: 'Forecast', label: 'Forecast' },
];

export const sectionId = (section: string) => `section-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** The two period dropdowns: the kind of period, then the specific one. */
export function PeriodFilter({
  period,
  kind,
  setKind,
  choices,
  choose,
}: {
  period: DashPeriod;
  kind: DashKind;
  setKind: (k: DashKind) => void;
  choices: { value: string; label: string }[];
  choose: (value: string) => void;
}) {
  return (
    <div className={s.filter}>
      <Dropdown label="Period" value={kind} onChange={(v) => setKind(v as DashKind)} options={DASH_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      {kind !== 'all' && <Dropdown label="Which period" value={dateParam(period.start)} onChange={choose} options={choices} wide />}
    </div>
  );
}

/** A native select with the dashboards' chevron (turned minus 45 degrees). */
function Dropdown({ label, value, onChange, options, wide }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; wide?: boolean }) {
  return (
    <label className={s.dropdown} data-wide={wide || undefined}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
    </label>
  );
}
