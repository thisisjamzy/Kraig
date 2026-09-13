'use client';

import { ChevronDown, Check } from 'lucide-react';
import { useLogic, type ProportionsMode } from '@/src/logic/goals/useLogic';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { DonutChart, type DonutSegment } from '@/src/widgets/DonutChart/DonutChart';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { GoalsHeader } from '@/src/widgets/GoalsHeader/GoalsHeader';
import styles from './GoalsAnalyticsScreen.module.css';

const PROPORTIONS_MODES: ProportionsMode[] = ['priority', 'type', 'category'];

export function GoalsAnalyticsScreen() {
  const strings = useStrings();
  const {
    currency,
    range,
    setRange,
    dedicatedTotals,
    dedicatedTrend,
    proportionsMode,
    setProportionsMode,
    proportionsBreakdown,
    loading,
    error,
  } = useLogic();

  const proportionsLabel: Record<ProportionsMode, string> = {
    priority: strings.goals.proportionsByPriority,
    type: strings.goals.proportionsByType,
    category: strings.goals.proportionsByCategory,
  };

  const kindSegments: DonutSegment[] = [
    { label: strings.goals.filterFixed, value: dedicatedTotals.fixed, color: '#4b6bfb' },
    { label: strings.goals.filterVariable, value: dedicatedTotals.variable, color: '#e8a33d' },
  ].filter((segment) => segment.value > 0);

  const proportionsSegments: DonutSegment[] = proportionsBreakdown.map((group) => ({
    label: group.label,
    value: group.amount,
    color: group.color,
  }));

  return (
    <div className={styles.page}>
      <GoalsHeader range={range} onChangeRange={setRange} />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {kindSegments.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>{strings.goalsAnalytics.fixedVsVariableTitle}</h2>
              <DonutChart
                segments={kindSegments}
                size={140}
                thickness={28}
                legendPosition="bottom"
                centerValue={`${formatAmount(dedicatedTotals.dedicated)}`}
                centerLabel={currency}
              />
            </div>
          )}

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{strings.goalsAnalytics.trendTitle}</h2>
            <TrendChart points={dedicatedTrend} color="var(--color-brand)" />
          </div>

          {proportionsSegments.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>{strings.goalsAnalytics.breakdownTitle}</h2>
                <ActionMenu
                  ariaLabel="Choose what the chart groups by"
                  triggerClassName={styles.proportionsFilterButton}
                  triggerIcon={
                    <>
                      {proportionsLabel[proportionsMode]}
                      <ChevronDown size={14} strokeWidth={2.25} />
                    </>
                  }
                  items={PROPORTIONS_MODES.map((mode) => ({
                    key: mode,
                    label: proportionsLabel[mode],
                    icon: mode === proportionsMode ? <Check size={16} strokeWidth={2} /> : <span />,
                    onSelect: () => setProportionsMode(mode),
                  }))}
                />
              </div>
              <DonutChart segments={proportionsSegments} size={140} thickness={70} legendPosition="bottom" legendWrap />
            </div>
          )}

          {kindSegments.length === 0 && proportionsSegments.length === 0 && (
            <p className={styles.emptyText}>{strings.goalsAnalytics.emptyText}</p>
          )}
        </>
      )}
    </div>
  );
}
