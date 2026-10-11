'use client';

// The Money and Time dashboards' shared page (two separate pages): one
// header row fixed under the app's own header, the "Insights" title on the
// left and the filter on the right (two dropdowns: the kind of period, then
// the specific one), then the period's
// heading, the hero and KPI tiles, then the period's cards from its
// layout (src/shared/dashboard/layouts.ts). Phone and web both render this;
// the phone passes the height of its app header as `stickyTop`.

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
}) {
  const words = periodWords(period, dashboard);
  return (
    <div className={`${s.root} ${charts.palette}`} data-web={web || undefined} style={{ ['--dash-top' as string]: stickyTop }}>
      <header className={s.head}>
        {web ? <h1 className={s.title}>{words.title}</h1> : <h1 className={s.pageTitle}>Insights</h1>}
        <div className={s.filter}>
          <Dropdown label="Period" value={kind} onChange={(v) => setKind(v as DashKind)} options={DASH_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          {kind !== 'all' && <Dropdown label="Which period" value={dateParam(period.start)} onChange={choose} options={choices} wide />}
        </div>
      </header>

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
                <h2 key={`s-${entry.section}-${i}`} className={s.section}>
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
