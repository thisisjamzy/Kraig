'use client';

import { ChevronLeft, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLogic, formatAmount, formatPercent } from '@/src/logic/auditReportDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { Logo } from '@/src/widgets/Logo/Logo';
import { walletColor } from '@/src/viewmodels/wallets';
import type { Status } from '@/src/shared/firestore/auditReport';
import styles from './AuditReportDetailScreen.module.css';

const STATUS_CLASS: Record<Status, string> = { green: styles.statusGreen, yellow: styles.statusYellow, red: styles.statusRed };
const TREND_ARROW: Record<'up' | 'down' | 'flat', string> = { up: '↑', down: '↓', flat: '→' };

function Badge({ status, children }: { status: Status; children: React.ReactNode }) {
  return <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>{children}</span>;
}

function Money({ value, currency }: { value: number; currency: string }) {
  return (
    <>
      {formatAmount(value)} {currency}
    </>
  );
}

export function AuditReportDetailScreen({ reportId }: { reportId: string }) {
  const strings = useStrings();
  const { data, loading, error, notFound, goBack, exportPdf } = useLogic(reportId);
  const s = strings.auditReportDetail;

  return (
    <div className={styles.page}>
      <div className={styles.brandBar}>
        <Logo className={styles.reportLogo} height={22} />
      </div>

      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{data?.meta.periodLabel ?? strings.auditReports.title}</h1>
        {data && (
          <button type="button" className={styles.exportButton} onClick={exportPdf}>
            <Download size={16} strokeWidth={2} />
            {s.exportPdf}
          </button>
        )}
      </header>

      <ScreenState loading={loading} error={error} />
      {notFound && <p className={styles.errorText}>{s.notFound}</p>}

      {data && (
        <div className={styles.report}>
          <p className={styles.generatedNote}>
            {data.meta.periodLabel} · {new Date(data.meta.generatedAt).toLocaleString()}
          </p>

          {/* 1. Executive Summary */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionExecutiveSummary}</h2>
            <div className={styles.statCardGrid}>
              {data.executiveSummary.statCards.map((card) => (
                <div key={card.key} className={styles.statCard}>
                  <span className={styles.statCardValue}>
                    {card.isPercent ? formatPercent(card.value) : formatAmount(card.value)}
                    {!card.isPercent && card.key === 'monthsSafe' ? ' mo' : ''}
                  </span>
                  <span className={`${styles.statCardTrend} ${STATUS_CLASS[card.status]}`}>{TREND_ARROW[card.trend]}</span>
                  <span className={styles.statCardLabel}>{card.label}</span>
                  <span className={styles.statCardSubtitle}>{card.subtitle}</span>
                </div>
              ))}
            </div>

            <h3 className={styles.subTitle}>{s.redFlagsTitle}</h3>
            {data.executiveSummary.redFlags.length === 0 ? (
              <p className={styles.okText}>
                <CheckCircle2 size={16} strokeWidth={2} /> {s.noRedFlags}
              </p>
            ) : (
              <div className={styles.alertList}>
                {data.executiveSummary.redFlags.map((flag) => (
                  <div key={flag.id} className={styles.alert}>
                    <AlertTriangle size={16} strokeWidth={2} className={styles.alertIcon} />
                    <div>
                      <p className={styles.alertTitle}>{flag.title}</p>
                      <p className={styles.alertMessage}>{flag.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 className={styles.subTitle}>{s.netWorthSparklineTitle}</h3>
            <TrendChart points={data.executiveSummary.netWorthSparkline} color="var(--color-brand)" />
            <p className={styles.footnote}>{data.executiveSummary.netWorthSparklineNote}</p>

            <div className={styles.summaryRowPair}>
              <p className={styles.summaryLine}>
                {s.goalsStatusLabel}: {data.executiveSummary.goalsStatus.completed}/{data.executiveSummary.goalsStatus.total} complete ·{' '}
                <Money value={data.executiveSummary.goalsStatus.totalSaved} currency={data.meta.currency} /> saved of{' '}
                <Money value={data.executiveSummary.goalsStatus.totalTarget} currency={data.meta.currency} />
              </p>
              <p className={styles.summaryLine}>
                {s.debtStatusLabel}: <Money value={data.executiveSummary.debtStatus.totalDebt} currency={data.meta.currency} /> across{' '}
                {data.executiveSummary.debtStatus.debtCount} debt(s)
                {data.executiveSummary.debtStatus.monthsToPayoffAvg != null && ` · avg ${data.executiveSummary.debtStatus.monthsToPayoffAvg} months to payoff`}
              </p>
            </div>
          </section>

          {/* 2. Balance Sheet */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionBalanceSheet}</h2>
            <p className={styles.footnote}>{data.balanceSheet.asOfNote}</p>

            <h3 className={styles.subTitle}>{s.assetsTitle}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{s.columnAccount}</th>
                    <th>{s.columnType}</th>
                    <th className={styles.numCol}>{s.columnBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.balanceSheet.assets.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.type}</td>
                      <td className={styles.numCol}>
                        <Money value={row.balance} currency={row.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.balanceSheet.liabilities.length > 0 && (
              <>
                <h3 className={styles.subTitle}>{s.liabilitiesTitle}</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{s.columnDebt}</th>
                        <th>{s.columnType}</th>
                        <th className={styles.numCol}>{s.columnBalance}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.balanceSheet.liabilities.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.type}</td>
                          <td className={styles.numCol}>
                            <Money value={row.balance} currency={row.currency} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <p className={styles.netWorthLine}>
              {s.netWorthLabel}: <strong>{formatAmount(data.balanceSheet.netWorth)} {data.meta.currency}</strong>
            </p>

            {data.balanceSheet.composition.length > 0 && (
              <>
                <h3 className={styles.subTitle}>{s.compositionTitle}</h3>
                <DonutChart
                  segments={data.balanceSheet.composition.map((c, i) => ({ label: c.name, value: c.value, color: walletColor(i) }))}
                  legendPosition="bottom"
                />
              </>
            )}
            {data.balanceSheet.debtPayoffOpportunity && <p className={styles.opportunityNote}>{data.balanceSheet.debtPayoffOpportunity}</p>}
          </section>

          {/* 3. Cash Flow Analysis */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionCashFlow}</h2>
            <h3 className={styles.subTitle}>{s.periodSummaryTitle}</h3>
            <div className={styles.statCardGrid}>
              <div className={styles.statCardSmall}>
                <span className={styles.statCardLabel}>{s.incomeLabel}</span>
                <span className={styles.statCardValue}>{formatAmount(data.cashFlow.periodIncome)}</span>
              </div>
              <div className={styles.statCardSmall}>
                <span className={styles.statCardLabel}>{s.expenseLabel}</span>
                <span className={styles.statCardValue}>{formatAmount(data.cashFlow.periodExpense)}</span>
              </div>
              <div className={styles.statCardSmall}>
                <span className={styles.statCardLabel}>{s.netLabel}</span>
                <span className={styles.statCardValue}>{formatAmount(data.cashFlow.periodNet)}</span>
              </div>
              <div className={styles.statCardSmall}>
                <span className={styles.statCardLabel}>{s.savingsRateLabel}</span>
                <span className={styles.statCardValue}>{formatPercent(data.cashFlow.periodSavingsRate)}</span>
              </div>
            </div>

            <h3 className={styles.subTitle}>{s.trendTitle}</h3>
            <div className={styles.cashflowChart}>
              {data.cashFlow.trend.map((m) => {
                const max = Math.max(...data.cashFlow.trend.map((p) => Math.max(p.income, p.expense)), 1);
                return (
                  <div key={m.monthKey} className={styles.cashflowColumn}>
                    <div className={styles.cashflowBars}>
                      <div className={styles.cashflowBarIn} style={{ height: `${Math.max((m.income / max) * 100, m.income > 0 ? 4 : 0)}%` }} />
                      <div className={styles.cashflowBarOut} style={{ height: `${Math.max((m.expense / max) * 100, m.expense > 0 ? 4 : 0)}%` }} />
                    </div>
                    <span className={styles.cashflowLabel}>{m.label}</span>
                  </div>
                );
              })}
            </div>

            <div className={styles.twoCol}>
              <div>
                <h3 className={styles.subTitle}>{s.incomeBreakdownTitle}</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{s.columnCategory}</th>
                        <th className={styles.numCol}>{s.columnAmount}</th>
                        <th className={styles.numCol}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cashFlow.incomeBreakdown.map((row) => (
                        <tr key={row.categoryId}>
                          <td>{row.name}</td>
                          <td className={styles.numCol}>{formatAmount(row.amount)}</td>
                          <td className={styles.numCol}>{formatPercent(row.percent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className={styles.subTitle}>{s.expenseBreakdownTitle}</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{s.columnCategory}</th>
                        <th className={styles.numCol}>{s.columnAmount}</th>
                        <th className={styles.numCol}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cashFlow.expenseBreakdown.map((row) => (
                        <tr key={row.categoryId}>
                          <td>{row.name}</td>
                          <td className={styles.numCol}>{formatAmount(row.amount)}</td>
                          <td className={styles.numCol}>{formatPercent(row.percent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {data.cashFlow.wastefulAlerts.length > 0 && (
              <>
                <h3 className={styles.subTitle}>{s.wastefulAlertsTitle}</h3>
                <div className={styles.alertList}>
                  {data.cashFlow.wastefulAlerts.map((alert, i) => (
                    <div key={i} className={styles.alert}>
                      <AlertTriangle size={16} strokeWidth={2} className={styles.alertIcon} />
                      <div>
                        <p className={styles.alertTitle}>
                          {alert.category} — {formatPercent(alert.percent)}
                        </p>
                        <p className={styles.alertMessage}>{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 4. Spending Habits */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionSpendingHabits}</h2>

            <h3 className={styles.subTitle}>{s.volatilityTitle}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{s.columnCategory}</th>
                    <th className={styles.numCol}>Avg</th>
                    <th className={styles.numCol}>Std Dev</th>
                    <th className={styles.numCol}>CV %</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spendingHabits.volatility.map((row) => (
                    <tr key={row.categoryId}>
                      <td>{row.name}</td>
                      <td className={styles.numCol}>{formatAmount(row.avg)}</td>
                      <td className={styles.numCol}>{formatAmount(row.stdDev)}</td>
                      <td className={styles.numCol}>
                        <Badge status={row.status}>{formatPercent(row.cv)}</Badge>
                      </td>
                      <td>{row.issue ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={styles.subTitle}>{s.topCategoriesTitle}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{s.columnCategory}</th>
                    <th className={styles.numCol}>{s.columnAmount}</th>
                    <th className={styles.numCol}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spendingHabits.topCategories.map((row) => (
                    <tr key={row.categoryId}>
                      <td>{row.name}</td>
                      <td className={styles.numCol}>{formatAmount(row.total)}</td>
                      <td className={styles.numCol}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={styles.subTitle}>{s.recurringVsVariableTitle}</h3>
            <p className={styles.summaryLine}>
              {s.recurringLabel}: {formatAmount(data.spendingHabits.recurringVsVariable.recurring)} {data.meta.currency} · {s.variableLabel}:{' '}
              {formatAmount(data.spendingHabits.recurringVsVariable.variable)} {data.meta.currency}
            </p>

            {data.spendingHabits.notes.length > 0 && (
              <>
                <h3 className={styles.subTitle}>{s.notesTitle}</h3>
                <ul className={styles.noteList}>
                  {data.spendingHabits.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* 5. Budget Adherence */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionBudgetAdherence}</h2>
            <p className={styles.summaryLine}>
              {s.consistencyScoreLabel}: <strong>{formatPercent(data.budgetAdherence.consistencyScore)}</strong>
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{s.columnCategory}</th>
                    <th className={styles.numCol}>{s.columnBudget}</th>
                    <th className={styles.numCol}>{s.columnActual}</th>
                    <th className={styles.numCol}>{s.columnVariance}</th>
                    <th className={styles.numCol}>{s.columnAnnualImpact}</th>
                    <th>{s.columnStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.budgetAdherence.rows.map((row) => (
                    <tr key={row.ruleId}>
                      <td>{row.name}</td>
                      <td className={styles.numCol}>{formatAmount(row.budgeted)}</td>
                      <td className={styles.numCol}>{formatAmount(row.actual)}</td>
                      <td className={styles.numCol}>
                        {row.variancePercent > 0 ? '+' : ''}
                        {formatPercent(row.variancePercent)}
                      </td>
                      <td className={styles.numCol}>{formatAmount(row.annualImpact)}</td>
                      <td>
                        <Badge status={row.status}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={styles.subTitle}>{s.chronicOveragesTitle}</h3>
            {data.budgetAdherence.chronicOverages.length === 0 ? (
              <p className={styles.okText}>
                <CheckCircle2 size={16} strokeWidth={2} /> {s.noChronicOverages}
              </p>
            ) : (
              <ul className={styles.noteList}>
                {data.budgetAdherence.chronicOverages.map((row) => (
                  <li key={row.ruleId}>
                    {row.name}: over budget by more than 25% for {row.months.length} month(s) ({row.months.join(', ')})
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 6. Financial Health Metrics */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionFinancialHealth}</h2>
            <div className={styles.statCardGrid}>
              {data.financialHealth.metrics.map((metric) => (
                <div key={metric.key} className={styles.statCard}>
                  <span className={styles.statCardValue}>{metric.isPercent ? formatPercent(metric.value) : `${metric.value} mo`}</span>
                  <Badge status={metric.status}>{metric.statusLabel}</Badge>
                  <span className={styles.statCardLabel}>{metric.label}</span>
                </div>
              ))}
            </div>

            <h3 className={styles.subTitle}>{s.healthOverallTitle}</h3>
            <p className={styles.summaryLine}>
              <Badge status={data.financialHealth.overallStatus}>{data.financialHealth.overallStatus}</Badge> {data.financialHealth.overallSummary}
            </p>

            <h3 className={styles.subTitle}>{s.incomeLossTitle}</h3>
            <p className={styles.summaryLine}>{data.financialHealth.incomeLossContingency}</p>

            <h3 className={styles.subTitle}>{s.rankedByUrgencyTitle}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {data.financialHealth.rankedByUrgency.map((row, i) => (
                    <tr key={i}>
                      <td>{row.label}</td>
                      <td>
                        <Badge status={row.status}>{row.note}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 7. Goals & Debt Summary */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionGoalsDebt}</h2>

            <h3 className={styles.subTitle}>{s.goalsTableTitle}</h3>
            {data.goalsDebt.goals.length === 0 ? (
              <p className={styles.footnote}>—</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{s.columnGoal}</th>
                      <th className={styles.numCol}>{s.columnTarget}</th>
                      <th className={styles.numCol}>{s.columnSaved}</th>
                      <th className={styles.numCol}>{s.columnProgress}</th>
                      <th>{s.columnDeadline}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.goalsDebt.goals.map((g) => (
                      <tr key={g.goalId}>
                        <td>{g.name}</td>
                        <td className={styles.numCol}>{formatAmount(g.totalAmount)}</td>
                        <td className={styles.numCol}>{formatAmount(g.amountCompleted)}</td>
                        <td className={styles.numCol}>{formatPercent(g.percent)}</td>
                        <td>{g.deadline ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.subTitle}>{s.debtsTableTitle}</h3>
            {data.goalsDebt.debts.length === 0 ? (
              <p className={styles.footnote}>—</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{s.columnDebt}</th>
                      <th className={styles.numCol}>{s.columnBalance}</th>
                      <th className={styles.numCol}>{s.columnMonthsToPayoff}</th>
                      <th>{s.columnPriority}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.goalsDebt.debts.map((d) => (
                      <tr key={d.debtId}>
                        <td>{d.name}</td>
                        <td className={styles.numCol}>{formatAmount(d.currentBalance)}</td>
                        <td className={styles.numCol}>{d.monthsToPayoff ?? '—'}</td>
                        <td>{d.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.goalsDebt.payoffOpportunity && (
              <>
                <h3 className={styles.subTitle}>{s.payoffOpportunityTitle}</h3>
                <p className={styles.opportunityNote}>{data.goalsDebt.payoffOpportunity}</p>
              </>
            )}
          </section>

          {/* 8. Appendix */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.sectionAppendix}</h2>

            <h3 className={styles.subTitle}>{s.totalsByCategoryTitle}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{s.columnCategory}</th>
                    <th className={styles.numCol}>{s.columnAmount}</th>
                    <th className={styles.numCol}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.appendix.totalsByCategory.map((row) => (
                    <tr key={row.categoryId}>
                      <td>{row.name}</td>
                      <td className={styles.numCol}>{formatAmount(row.total)}</td>
                      <td className={styles.numCol}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={styles.subTitle}>{s.transactionLogTitle}</h3>
            {data.appendix.truncatedCount > 0 && (
              <p className={styles.footnote}>
                {s.truncatedNoticePrefix} {data.appendix.transactions.length} {s.truncatedNoticeSuffix}
              </p>
            )}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{s.columnDate}</th>
                    <th>{s.columnDescription}</th>
                    <th>{s.columnAccount}</th>
                    <th>{s.columnCategory}</th>
                    <th>{s.columnType}</th>
                    <th className={styles.numCol}>{s.columnAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.appendix.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>{t.description}</td>
                      <td>{t.account}</td>
                      <td>{t.category}</td>
                      <td>{t.type}</td>
                      <td className={styles.numCol}>{formatAmount(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className={styles.printFooter}>{s.printedFooter}</p>
        </div>
      )}
    </div>
  );
}
