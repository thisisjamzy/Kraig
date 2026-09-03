'use client';

import { useLogic, formatAmount, type StatsPeriod, type HabitPeriod } from '@/src/logic/statistics/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './StatisticsScreen.module.css';

const PERIOD_ORDER: StatsPeriod[] = ['Week', 'Month', 'Quarter', 'Year'];
const HABIT_PERIOD_ORDER: HabitPeriod[] = ['Daily', 'Monthly', 'Yearly'];
const CONSISTENCY_SCALE = [1, 0.5, 0];

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
    insightsPeriod,
    setInsightsPeriod,
    habitPeriod,
    setHabitPeriod,
    habitBreakdown,
    habitMax,
    incomePeriod,
    setIncomePeriod,
    totalIncomeForPeriod,
    incomeCurrency,
    incomeSources,
    incomeConsistency,
    consistencyMax,
    trendsPeriod,
    setTrendsPeriod,
    financialTrends,
    trendsMax,
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
          {periodTabs(insightsPeriod, setInsightsPeriod)}
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
            <div className={styles.habitChart}>
              {habitBreakdown.map((day) => (
                <div key={day.label} className={styles.habitColumn}>
                  <div className={styles.habitBars}>
                    <div
                      className={styles.habitBarIncome}
                      style={{ height: `${Math.max((day.income / habitMax) * 100, 2)}%` }}
                    />
                    <div
                      className={styles.habitBarExpense}
                      style={{ height: `${Math.max((day.expense / habitMax) * 100, 2)}%` }}
                    />
                    <div
                      className={styles.habitBarSavings}
                      style={{ height: `${Math.max((day.savings / habitMax) * 100, 2)}%` }}
                    />
                  </div>
                  <span className={styles.habitLabel}>{day.label}</span>
                </div>
              ))}
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

      {/* Income Analysis */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.incomeAnalysis}</h2>
          {periodTabs(incomePeriod, setIncomePeriod)}
        </div>

        <p className={styles.totalIncome}>
          {formatAmount(totalIncomeForPeriod)} <span className={styles.summaryCurrency}>{incomeCurrency}</span>
        </p>
        <p className={styles.totalIncomeCaption}>{strings.statistics.totalIncome}</p>

        {incomeSources.length > 0 ? (
          <div className={styles.incomeList}>
            {incomeSources.map((source) => (
              <div key={source.label} className={styles.incomeRow}>
                <div className={styles.incomeRowHeader}>
                  <span className={styles.incomeLabel}>{source.label}</span>
                  <span className={styles.incomeValue}>
                    {formatAmount(source.amount)} &bull; {source.percent}%
                  </span>
                </div>
                <div className={styles.incomeTrack}>
                  <div className={styles.incomeFill} style={{ width: `${source.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>{strings.statistics.noIncomeThisPeriod}</p>
        )}
      </section>

      {/* Income Consistency */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{strings.statistics.incomeConsistency}</h2>

        {incomeConsistency.some((m) => m.amount > 0) ? (
          <div className={styles.consistencyRow}>
            <div className={styles.consistencyAxis} aria-hidden="true">
              {CONSISTENCY_SCALE.map((fraction) => (
                <span key={fraction}>{Math.round(consistencyMax * fraction)}%</span>
              ))}
            </div>
            <div className={styles.consistencyChart}>
              <div className={styles.consistencyGridlines} aria-hidden="true">
                {CONSISTENCY_SCALE.map((fraction) => (
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

      {/* Financial Trends */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.statistics.financialTrends}</h2>
          {periodTabs(trendsPeriod, setTrendsPeriod)}
        </div>

        <div className={styles.trendCard}>
          <svg className={styles.trendChart} viewBox="0 0 300 90" preserveAspectRatio="none">
            {financialTrends.length > 1 && (
              <>
                {(
                  [
                    ['income', 'var(--color-text-secondary)'],
                    ['savings', 'var(--color-brand)'],
                    ['spending', 'var(--color-danger)'],
                  ] as const
                ).map(([key, stroke]) => (
                  <polyline
                    key={key}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
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

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendLine} style={{ background: 'var(--color-danger)' }} />
            {strings.statistics.trendsSpending}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendLine} style={{ background: 'var(--color-text-secondary)' }} />
            {strings.statistics.trendsIncome}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendLine} style={{ background: 'var(--color-brand)' }} />
            {strings.statistics.trendsSavings}
          </span>
        </div>
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
