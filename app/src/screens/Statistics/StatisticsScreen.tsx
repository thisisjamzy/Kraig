'use client';

import { useLogic, formatAmount } from '@/src/logic/statistics/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './StatisticsScreen.module.css';

// Colorless placeholder rows — same row structure as the real lists, just
// gray filler bars, so an empty/loading state reserves the same vertical
// space as real data instead of collapsing to a single line of text.
const PLACEHOLDER_CATEGORY_ROWS = 3;
const PLACEHOLDER_COMPARISON_LABELS = ['Spending', 'Income', 'Net savings'];

export function StatisticsScreen() {
  const strings = useStrings();
  const { summary, topCategories, donutSlices, donutCircumference, monthComparison, loading, error } =
    useLogic();

  return (
    <div className={styles.page}>
      <ScreenState loading={loading} error={error} />

      <section className={styles.summarySection}>
        <span className={styles.summaryLabel}>{strings.statistics.acrossAllAccounts}</span>
        <p className={styles.summaryAmount}>
          {formatAmount(summary.acrossAllAccounts)}{' '}
          <span className={styles.summaryCurrency}>{summary.currency}</span>
        </p>

        <div className={styles.tileGrid}>
          <div className={styles.tile}>
            <span className={styles.tileLabel}>{strings.statistics.spending}</span>
            <p className={styles.tileValueNegative}>-{formatAmount(summary.spending)}</p>
            <span className={styles.tileCaption}>{strings.statistics.totalOutflow}</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileLabel}>{strings.statistics.income}</span>
            <p className={styles.tileValue}>{formatAmount(summary.income)}</p>
            <span className={styles.tileCaption}>{strings.statistics.totalInflow}</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileLabel}>{strings.statistics.netSavings}</span>
            <p className={styles.tileValue}>{formatAmount(summary.netSavings)}</p>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileLabel}>{strings.statistics.savingsRate}</span>
            <p className={styles.tileValue}>{summary.savingsRate}%</p>
          </div>
        </div>

        <p className={styles.activeAccounts}>
          {summary.activeAccounts} {strings.statistics.activeAccountsSuffix}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.spendingInsights}</h2>
        </div>

        <div className={styles.donutRow}>
          <svg className={styles.donut} viewBox="0 0 140 140">
            <g transform="rotate(-90 70 70)">
              {donutSlices.length > 0 ? (
                donutSlices.map((slice) => (
                  <circle
                    key={slice.label}
                    cx="70"
                    cy="70"
                    r={60}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="18"
                    strokeDasharray={`${slice.length} ${donutCircumference - slice.length}`}
                    strokeDashoffset={slice.dashoffset}
                  />
                ))
              ) : (
                <circle cx="70" cy="70" r={60} fill="none" stroke="var(--color-border)" strokeWidth="18" />
              )}
            </g>
          </svg>
        </div>

        {donutSlices.length > 0 ? (
          <div className={styles.legendGrid}>
            {donutSlices.map((slice) => (
              <span key={slice.label} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: slice.color }} />
                {slice.label} ({slice.percent}%)
              </span>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>{strings.statistics.noSpendingThisMonth}</p>
        )}

        <h3 className={styles.subheading}>{strings.statistics.topCategories}</h3>
        {topCategories.length > 0 ? (
          <div className={styles.topCategoryList}>
            {topCategories.map((category) => (
              <div key={category.label} className={styles.topCategoryRow}>
                <span className={styles.topCategoryLabel}>{category.label}</span>
                <span className={styles.topCategoryValue}>
                  {formatAmount(category.amount)} {summary.currency} &bull; {category.percent}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.topCategoryList} aria-hidden="true">
            {Array.from({ length: PLACEHOLDER_CATEGORY_ROWS }, (_, index) => (
              <div key={index} className={styles.topCategoryRow}>
                <span className={`${styles.topCategoryLabel} ${styles.placeholderLabel}`} style={{ width: 90 }} />
                <span className={`${styles.topCategoryValue} ${styles.placeholderLabel}`} style={{ width: 60 }} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{strings.statistics.thisMonthVsLastMonth}</h2>
        {monthComparison.length > 0 ? (
          <div className={styles.comparisonList}>
            {monthComparison.map((row) => (
              <div key={row.label} className={styles.comparisonRow}>
                <span className={styles.comparisonLabel}>{row.label}</span>
                <span className={styles.comparisonValue}>{formatAmount(row.current)}</span>
                <span className={styles.comparisonValue}>{formatAmount(row.previous)}</span>
                <span
                  className={row.percent < 0 ? styles.comparisonPercentDown : styles.comparisonPercentUp}
                >
                  {row.percent}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className={styles.comparisonList} aria-hidden="true">
              {PLACEHOLDER_COMPARISON_LABELS.map((label) => (
                <div key={label} className={styles.comparisonRow}>
                  <span className={styles.comparisonLabel}>{label}</span>
                  <span className={`${styles.comparisonValue} ${styles.placeholderLabel}`} style={{ width: 40 }} />
                  <span className={`${styles.comparisonValue} ${styles.placeholderLabel}`} style={{ width: 40 }} />
                  <span className={`${styles.comparisonValue} ${styles.placeholderLabel}`} style={{ width: 24 }} />
                </div>
              ))}
            </div>
            <p className={styles.emptyText}>{strings.statistics.noComparisonYet}</p>
          </>
        )}
      </section>
    </div>
  );
}
