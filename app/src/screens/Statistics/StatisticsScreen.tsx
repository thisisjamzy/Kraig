'use client';

import { useLogic, formatAmount, type StatsPeriod, type HabitPeriod } from '@/src/logic/statistics/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './StatisticsScreen.module.css';

const PERIOD_ORDER: StatsPeriod[] = ['Quarter', 'Year'];
const HABIT_PERIOD_ORDER: HabitPeriod[] = ['Daily', 'Monthly', 'Yearly'];
// Three axis indicators (max, half, zero) — reused by every bar/line chart
// on this page so each one clearly shows how far its values sit from zero,
// not just their size relative to each other.
const AXIS_SCALE = [1, 0.5, 0];

// Colorless placeholder rows — same row structure as the real lists, just
// gray filler bars, so an empty/loading state reserves the same vertical
// space as real data instead of collapsing to a single line of text.
const PLACEHOLDER_CATEGORY_ROWS = 3;
const PLACEHOLDER_COMPARISON_LABELS = ['Spending', 'Income', 'Net savings'];

export function StatisticsScreen() {
  const strings = useStrings();
  const {
    summary,
    topCategories,
    donutSlices,
    donutCircumference,
    monthComparison,
    period,
    setPeriod,
    habitPeriod,
    setHabitPeriod,
    habitBreakdown,
    habitMax,
    incomeConsistency,
    consistencyMax,
    financialTrends,
    trendsMax,
    savingsTrendMax,
    categorySpendTrend,
    categorySpendMax,
    loading,
    error,
  } = useLogic();

  function periodTabs(current: StatsPeriod, onChange: (period: StatsPeriod) => void) {
    return (
      <div className={styles.periodTabs}>
        {PERIOD_ORDER.map((period) => (
          <button
            key={period}
            type="button"
            className={`${styles.periodTab} ${current === period ? styles.periodTabActive : ''}`}
            onClick={() => onChange(period)}
          >
            {strings.statistics.periods[period]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ScreenState loading={loading} error={error} />

      <section className={styles.summarySection}>
        {/* One shared Quarter/Year filter — drives every "Records" number
            below (global totals, not scoped to any one account) plus
            Spending Insights and Financial Trends further down (each used
            to carry its own separate, disconnected period control). */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.recordsTitle}</h2>
          {periodTabs(period, setPeriod)}
        </div>

        <span className={styles.summaryLabel}>{strings.statistics.acrossAllAccounts}</span>
        <p className={styles.summaryAmount}>
          {formatAmount(summary.acrossAllAccounts)}{' '}
          <span className={styles.summaryCurrency}>{summary.currency}</span>
        </p>

        <div className={styles.tileGrid}>
          <div className={`${styles.tile} ${styles.tileOrange}`}>
            <span className={styles.tileLabel}>{strings.statistics.spending}</span>
            <p className={styles.tileValueNegative}>-{formatAmount(summary.spending)}</p>
            <span className={styles.tileCaption}>{strings.statistics.totalOutflow}</span>
          </div>
          <div className={`${styles.tile} ${styles.tileGreen}`}>
            <span className={styles.tileLabel}>{strings.statistics.income}</span>
            <p className={styles.tileValue}>{formatAmount(summary.income)}</p>
            <span className={styles.tileCaption}>{strings.statistics.totalInflow}</span>
          </div>
          <div className={`${styles.tile} ${styles.tilePurple}`}>
            <span className={styles.tileLabel}>{strings.statistics.netSavings}</span>
            <p className={styles.tileValue}>{formatAmount(summary.netSavings)}</p>
          </div>
          <div className={`${styles.tile} ${styles.tileBlue}`}>
            <span className={styles.tileLabel}>{strings.statistics.savingsRate}</span>
            <p className={styles.tileValue}>{summary.savingsRate}%</p>
          </div>
        </div>

        <p className={styles.activeAccounts}>
          {summary.activeAccounts} {strings.statistics.activeAccountsSuffix}
        </p>
      </section>

      {/* Spending Insights */}
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

      {/* Habit Breakdown */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.habitBreakdown}</h2>
          <div className={styles.periodTabs}>
            {HABIT_PERIOD_ORDER.map((period) => (
              <button
                key={period}
                type="button"
                className={`${styles.periodTab} ${habitPeriod === period ? styles.periodTabActive : ''}`}
                onClick={() => setHabitPeriod(period)}
              >
                {strings.statistics.habitPeriods[period]}
              </button>
            ))}
          </div>
        </div>

        {habitBreakdown.some((day) => day.income || day.expense || day.savings) ? (
          <>
            <div className={styles.barChartRow}>
              <div className={styles.barChartAxis} aria-hidden="true">
                {AXIS_SCALE.map((fraction) => (
                  <span key={fraction}>{formatAmount(Math.round(habitMax * fraction))}</span>
                ))}
              </div>
              <div className={styles.barChartArea}>
                <div className={styles.barChartGridlines} aria-hidden="true">
                  {AXIS_SCALE.map((fraction) => (
                    <span key={fraction} className={styles.barChartGridline} />
                  ))}
                </div>
                <div className={styles.barChart}>
                  {habitBreakdown.map((day) => (
                    <div key={day.label} className={styles.barChartColumn}>
                      <div className={styles.barChartBars}>
                        <div
                          className={styles.barIncome}
                          style={{ height: `${Math.max((day.income / habitMax) * 100, 2)}%` }}
                        />
                        <div
                          className={styles.barExpense}
                          style={{ height: `${Math.max((day.expense / habitMax) * 100, 2)}%` }}
                        />
                        <div
                          className={styles.barSavings}
                          style={{ height: `${Math.max((day.savings / habitMax) * 100, 2)}%` }}
                        />
                      </div>
                      <span className={styles.barChartLabel}>{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#ff9800' }} />
                {strings.statistics.habitIncome}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#7b7ef3' }} />
                {strings.statistics.habitExpense}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--ink-bg)' }} />
                {strings.statistics.habitSavings}
              </span>
            </div>
          </>
        ) : (
          <p className={styles.emptyText}>{strings.statistics.noHabitData}</p>
        )}
      </section>

      {/* Income Consistency */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{strings.statistics.incomeConsistency}</h2>

        {incomeConsistency.some((m) => m.amount > 0) ? (
          <div className={styles.consistencyRow}>
            <div className={styles.consistencyAxis} aria-hidden="true">
              {AXIS_SCALE.map((fraction) => (
                <span key={fraction}>{Math.round(consistencyMax * fraction)}%</span>
              ))}
            </div>
            <div className={styles.consistencyChart}>
              <div className={styles.consistencyGridlines} aria-hidden="true">
                {AXIS_SCALE.map((fraction) => (
                  <span key={fraction} className={styles.consistencyGridline} />
                ))}
              </div>
              {incomeConsistency.map((month) => {
                const ratio = consistencyMax > 0 ? month.percentOfAverage / consistencyMax : 0;
                return (
                  <div key={month.label} className={styles.consistencyColumn}>
                    <div className={styles.consistencyBarTrack}>
                      <div
                        className={styles.consistencyBar}
                        style={{
                          height: `${Math.max(ratio * 100, month.amount > 0 ? 4 : 0)}%`,
                          background: `color-mix(in srgb, var(--color-brand) ${Math.max(
                            30,
                            Math.round(ratio * 100)
                          )}%, var(--color-surface))`,
                        }}
                        title={`${month.percentOfAverage}% of average`}
                      />
                    </div>
                    <span className={styles.consistencyLabel}>{month.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className={styles.emptyText}>{strings.statistics.noIncomeConsistencyData}</p>
        )}
      </section>

      {/* Cashflow — same period-bucketed data as Financial Trends below, as
          side-by-side income/expense bars instead of lines (same shape
          Home's own Cashflow chart uses, see src/screens/Home/HomeScreen.tsx). */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.home.spendingBreakdown}</h2>
        </div>

        {financialTrends.length > 0 ? (
          <>
            <div className={styles.barChartRow}>
              <div className={styles.barChartAxis} aria-hidden="true">
                {AXIS_SCALE.map((fraction) => (
                  <span key={fraction}>{formatAmount(Math.round(trendsMax * fraction))}</span>
                ))}
              </div>
              <div className={styles.barChartArea}>
                <div className={styles.barChartGridlines} aria-hidden="true">
                  {AXIS_SCALE.map((fraction) => (
                    <span key={fraction} className={styles.barChartGridline} />
                  ))}
                </div>
                <div className={styles.barChart}>
                  {financialTrends.map((point) => (
                    <div key={point.label} className={styles.barChartColumn}>
                      <div className={styles.barChartBars}>
                        <div
                          className={styles.barIncome}
                          style={{ height: `${Math.max((point.income / trendsMax) * 100, 2)}%` }}
                        />
                        <div
                          className={styles.barExpense}
                          style={{ height: `${Math.max((point.spending / trendsMax) * 100, 2)}%` }}
                        />
                      </div>
                      <span className={styles.barChartLabel}>{point.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#ff9800' }} />
                {strings.home.legendIncome}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#7b7ef3' }} />
                {strings.home.legendExpense}
              </span>
            </div>
          </>
        ) : (
          <p className={styles.emptyText}>{strings.statistics.noSpendingThisMonth}</p>
        )}
      </section>

      {/* Financial Trends */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.financialTrends}</h2>
        </div>

        <div className={styles.trendCard}>
          <div className={styles.trendRow}>
            <div className={styles.trendAxis} aria-hidden="true">
              {AXIS_SCALE.map((fraction) => (
                <span key={fraction}>{formatAmount(Math.round(trendsMax * fraction))}</span>
              ))}
            </div>
            <div className={styles.trendChartCol}>
              <svg className={styles.trendChart} viewBox="0 0 300 90" preserveAspectRatio="none">
                {AXIS_SCALE.map((fraction) => (
                  <line
                    key={fraction}
                    x1={0}
                    y1={86 - fraction * 80}
                    x2={300}
                    y2={86 - fraction * 80}
                    stroke="var(--color-border)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {financialTrends.length > 1 && (
                  <>
                    {(
                      [
                        ['income', 'var(--color-text-secondary)'],
                        ['spending', 'var(--color-danger)'],
                      ] as const
                    ).map(([key, stroke]) => (
                      <polyline
                        key={key}
                        fill="none"
                        stroke={stroke}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        points={financialTrends
                          .map((point, index) => {
                            const x = (index / (financialTrends.length - 1)) * 300;
                            const y = 86 - (point[key] / trendsMax) * 80;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                      />
                    ))}
                    {financialTrends.map((point, index) => {
                      const x = (index / (financialTrends.length - 1)) * 300;
                      const y = 86 - (point.spending / trendsMax) * 80;
                      return <circle key={point.label} cx={x} cy={y} r={2.5} fill="var(--color-danger)" />;
                    })}
                  </>
                )}
              </svg>
              <div className={styles.trendLabels}>
                {financialTrends.map((point) => (
                  <span key={point.label} className={styles.trendLabel}>
                    {point.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendLine} style={{ background: 'var(--color-danger)' }} />
            {strings.statistics.trendsSpending}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendLine} style={{ background: 'var(--color-text-secondary)' }} />
            {strings.statistics.trendsIncome}
          </span>
        </div>
      </section>

      {/* Savings Trend — the live compounding total across every Savings
          Account, sampled at each bucket, not a flat "same amount saved"
          line — its own scale, since a running total can dwarf a single
          period's income/spending (see savingsTrendMax). */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.savingsTrend}</h2>
        </div>

        <div className={styles.trendCard}>
          <div className={styles.trendRow}>
            <div className={styles.trendAxis} aria-hidden="true">
              {AXIS_SCALE.map((fraction) => (
                <span key={fraction}>{formatAmount(Math.round(savingsTrendMax * fraction))}</span>
              ))}
            </div>
            <div className={styles.trendChartCol}>
              <svg className={styles.trendChart} viewBox="0 0 300 90" preserveAspectRatio="none">
                {AXIS_SCALE.map((fraction) => (
                  <line
                    key={fraction}
                    x1={0}
                    y1={86 - fraction * 80}
                    x2={300}
                    y2={86 - fraction * 80}
                    stroke="var(--color-border)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {financialTrends.length > 1 && (
                  <>
                    <polyline
                      fill="none"
                      stroke="var(--color-brand)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      points={financialTrends
                        .map((point, index) => {
                          const x = (index / (financialTrends.length - 1)) * 300;
                          const y = 86 - (point.savings / savingsTrendMax) * 80;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                    {financialTrends.map((point, index) => {
                      const x = (index / (financialTrends.length - 1)) * 300;
                      const y = 86 - (point.savings / savingsTrendMax) * 80;
                      return <circle key={point.label} cx={x} cy={y} r={2.5} fill="var(--color-brand)" />;
                    })}
                  </>
                )}
              </svg>
              <div className={styles.trendLabels}>
                {financialTrends.map((point) => (
                  <span key={point.label} className={styles.trendLabel}>
                    {point.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Spend Trend — the same period buckets as Financial Trends
          above, stacked by the top 5 spending categories, so growth or
          decline in any one category over time is visible (the donut only
          shows one period's share, not how a category moves across
          several). */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.categorySpendTrend}</h2>
        </div>

        {categorySpendTrend.series.length > 0 ? (
          <>
            <div className={styles.barChartRow}>
              <div className={styles.barChartAxis} aria-hidden="true">
                {AXIS_SCALE.map((fraction) => (
                  <span key={fraction}>{formatAmount(Math.round(categorySpendMax * fraction))}</span>
                ))}
              </div>
              <div className={styles.barChartArea}>
                <div className={styles.barChartGridlines} aria-hidden="true">
                  {AXIS_SCALE.map((fraction) => (
                    <span key={fraction} className={styles.barChartGridline} />
                  ))}
                </div>
                <div className={styles.barChart}>
                  {categorySpendTrend.labels.map((label, bucketIndex) => (
                    <div key={label} className={styles.barChartColumn}>
                      <div className={styles.stackBar}>
                        {categorySpendTrend.series.map((s) => (
                          <div
                            key={s.categoryId}
                            className={styles.stackSegment}
                            style={{
                              height: `${(s.values[bucketIndex] / categorySpendMax) * 100}%`,
                              background: s.color,
                            }}
                            title={`${s.label}: ${formatAmount(s.values[bucketIndex])} ${summary.currency}`}
                          />
                        ))}
                      </div>
                      <span className={styles.barChartLabel}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.legend}>
              {categorySpendTrend.series.map((s) => (
                <span key={s.categoryId} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.emptyText}>{strings.statistics.noCategorySpendTrendData}</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          This {strings.statistics.periods[period]} vs Last {strings.statistics.periods[period]}
        </h2>
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
