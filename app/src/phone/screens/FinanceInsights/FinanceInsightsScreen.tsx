'use client';

// Insights (Money mode) — a clear picture of the household's finances for
// a chosen period: one sentence (and its notifications), a snapshot, cash flow, plan vs
// actual, unplanned spending, a forward-looking forecast, where money
// goes, income, savings and daily habits. Every figure comes from
// src/viewmodels/finance via src/logic/financeInsights. Sections can be
// collapsed and reordered (remembered per device); "Share summary" prints
// the snapshot, plan vs actual and forecast as a one-page PDF.

import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Share2, SlidersHorizontal } from 'lucide-react';
import { useLogic, type SectionId } from '@/src/logic/financeInsights/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import {
  cashFlowTakeaway,
  forecastTakeaway,
  habitsTakeaway,
  incomeTakeaway,
  moneyTakeaway,
  snapshotTakeaway,
  unplannedTakeaway,
} from '@/src/viewmodels/finance/insights';
import type { RangeKind } from '@/src/viewmodels/finance/ranges';
import { CashFlowChart, Snapshot } from '@/src/phone/screens/FinanceInsights/OverviewSections';
import { PlanVsActual, UnplannedSection } from '@/src/phone/screens/FinanceInsights/PlanSections';
import { ForecastSection } from '@/src/phone/screens/FinanceInsights/ForecastSection';
import { HabitsSection, IncomeSection, MoneySection } from '@/src/phone/screens/FinanceInsights/DetailSections';
import { KeyCharts } from '@/src/phone/screens/FinanceInsights/KeyCharts';
import { Pills, Section } from '@/src/phone/screens/FinanceInsights/parts';
import styles from '@/src/phone/screens/FinanceInsights/FinanceInsights.module.css';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';

const RANGES: { value: RangeKind; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const TITLES: Record<SectionId, string> = {
  snapshot: 'Snapshot',
  keycharts: 'Key charts',
  cashflow: 'Cash flow over time',
  plan: 'Plan vs actual',
  unplanned: 'Unplanned spending',
  forecast: 'Forecast',
  money: 'Where the money goes',
  income: 'Income by source',
  habits: 'Daily habits',
};

export function FinanceInsightsScreen() {
  const v = useLogic();
  const swipeRef = useSwipeModeSwitch('money');
  const [reordering, setReordering] = useState(false);
  const c = v.currency;


  const sections: Record<SectionId, { show: boolean; takeaway?: string; details?: string; detailsLabel?: string; body: ReactNode; print?: boolean; highlight?: boolean }> = {
    snapshot: { show: true, takeaway: snapshotTakeaway(v.totals, c), details: v.historyHref(), body: <Snapshot v={v} />, print: true },
    keycharts: {
      show: true,
      takeaway: `Four trends over ${v.keyWindow.label}, ending at the period you picked.`,
      body: <KeyCharts v={v} />,
    },
    cashflow: { show: true, takeaway: cashFlowTakeaway(v.flow, c), details: v.historyHref(), body: <CashFlowChart v={v} /> },
    plan: { show: true, details: v.budgetHref, detailsLabel: 'Open the budget', body: <PlanVsActual v={v} />, print: true },
    unplanned: { show: true, highlight: true, takeaway: unplannedTakeaway(v.unplanned, c), details: v.historyHref(), body: <UnplannedSection v={v} /> },
    forecast: {
      show: true,
      takeaway: forecastTakeaway(v.projection, c),
      details: '/baskets/forecast',
      detailsLabel: 'Plans forecast',
      body: <ForecastSection v={v} />,
      print: true,
    },
    money: { show: true, takeaway: moneyTakeaway(v.money), details: v.historyHref(), body: <MoneySection v={v} /> },
    income: { show: true, takeaway: incomeTakeaway(v.income, c), details: v.historyHref(), body: <IncomeSection v={v} /> },
    habits: { show: v.showHabits, takeaway: habitsTakeaway(v.habits, c), details: v.historyHref(), body: <HabitsSection v={v} /> },
  };

  return (
    <div className={styles.page} ref={swipeRef} data-print-page="insights">
      <div className={styles.top} data-print="hide">
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Insights</h1>
          <div className={styles.titleActions}>
            <button type="button" className={styles.iconButton} aria-pressed={reordering} onClick={() => setReordering((r) => !r)} aria-label="Customize sections" title="Customize sections">
              <SlidersHorizontal size={17} strokeWidth={2} />
            </button>
            <button type="button" className={styles.iconButton} onClick={() => window.print()} aria-label="Share summary" title="Share summary (PDF)">
              <Share2 size={17} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className={styles.rangeScroll}>
          <Pills label="Time range" value={v.kind} onChange={v.setKind} options={RANGES} />
        </div>
        <div className={styles.periodBar}>
          <button type="button" className={styles.stepButton} onClick={() => v.step(-1)} disabled={!v.canStep} aria-label="Previous period">
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <span className={styles.periodLabel} aria-live="polite">
            {v.periodLabel}
          </span>
          <button type="button" className={styles.stepButton} onClick={() => v.step(1)} disabled={!v.canStepForward} aria-label="Next period">
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        </div>
        {v.kind === 'custom' && (
          <div className={styles.customRange}>
            <label>
              From
              <input type="date" value={v.custom.start} max={v.custom.end} onChange={(e) => e.target.value && v.setCustom({ ...v.custom, start: e.target.value })} />
            </label>
            <label>
              To
              <input type="date" value={v.custom.end} min={v.custom.start} onChange={(e) => e.target.value && v.setCustom({ ...v.custom, end: e.target.value })} />
            </label>
          </div>
        )}
        <div className={styles.compare}>
          <span>Compare to</span>
          <Pills
            label="Compare to"
            small
            value={v.compareTo}
            onChange={v.setCompareTo}
            options={[
              { value: 'previous', label: 'Previous period' },
              { value: 'lastYear', label: 'Same period last year' },
            ]}
          />
        </div>
      </div>

      <p className={styles.printHeading}>
        Dreda summary · {v.periodLabel}
      </p>

      <ScreenState loading={v.loading} />

      {/* The period in one sentence; what needs doing is in Notifications. */}
      {!v.loading && (
        <p className={styles.neutral}>
          {snapshotTakeaway(v.totals, c)}
          <NotificationsLink module="money" about="money" />
        </p>
      )}

      {!v.loading &&
        v.layout.order.map((id) => {
          const s = sections[id];
          if (!s.show) return null;
          return (
            <Section
              key={id}
              id={id}
              title={TITLES[id]}
              takeaway={s.takeaway}
              detailsHref={s.details}
              detailsLabel={s.detailsLabel}
              collapsed={v.layout.collapsed.includes(id)}
              onToggle={() => v.toggleCollapsed(id)}
              reordering={reordering}
              onMove={(delta) => v.move(id, delta)}
              highlight={s.highlight}
              print={s.print}
            >
              {s.body}
            </Section>
          );
        })}
    </div>
  );
}
