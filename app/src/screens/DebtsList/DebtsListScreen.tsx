'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/debtsList/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { Logo } from '@/src/widgets/Logo/Logo';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import styles from './DebtsListScreen.module.css';

const PRIORITY_LABEL_KEY = { high: 'priorityHigh', medium: 'priorityMedium', low: 'priorityLow' } as const;

export function DebtsListScreen() {
  const router = useRouter();
  const strings = useStrings();
  const { currency, debts, debtSummary, totalDebtTrend, archiveDebt, loading, error } = useLogic();

  const [confirmDebtId, setConfirmDebtId] = useState<string | null>(null);

  // Lighter tints of the same three priority colors used everywhere else
  // (danger red / amber / brand teal) — a full-strength donut ring read as
  // too dark against the page.
  const prioritySegments = [
    { label: strings.goals[PRIORITY_LABEL_KEY.high], value: debtSummary.byPriority.high, color: '#f3948c' },
    { label: strings.goals[PRIORITY_LABEL_KEY.medium], value: debtSummary.byPriority.medium, color: '#f2c680' },
    { label: strings.goals[PRIORITY_LABEL_KEY.low], value: debtSummary.byPriority.low, color: '#7fe4bf' },
  ];

  return (
    <div className={styles.page}>
      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {debtSummary.debtCount > 0 && (
            <>
              <div className={styles.heroCardWrap}>
                <div className={styles.heroCard}>
                  <div className={styles.heroTopRow}>
                    <span className={styles.heroLabel}>{strings.goals.totalDebtLabel}</span>
                    <div data-theme="dark">
                      <Logo height={14} className={styles.heroLogo} />
                    </div>
                  </div>
                  <p className={styles.heroAmount}>
                    {formatAmount(debtSummary.totalDebt)} {currency}
                  </p>
                  <div className={styles.heroInfoRow}>
                    <div className={styles.heroInfoCol}>
                      <span className={styles.heroInfoLabel}>High priority</span>
                      <span className={styles.heroInfoValue}>
                        {formatAmount(debtSummary.byPriority.high)} {currency}
                      </span>
                    </div>
                    <div className={styles.heroInfoCol}>
                      <span className={styles.heroInfoLabel}>Next payment</span>
                      <span className={styles.heroInfoValue}>
                        {debtSummary.nextPaymentDate
                          ? debtSummary.nextPaymentDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <button type="button" className={styles.heroAddButton} onClick={() => router.push('/debts/new')}>
                  <Plus size={16} strokeWidth={2.5} />
                  {strings.goals.addDebt}
                </button>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total debt financing</span>
                  <p className={styles.statValue}>
                    {formatAmount(debtSummary.totalFinanced)} {currency}
                  </p>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total debt refunded</span>
                  <p className={styles.statValue}>
                    {formatAmount(debtSummary.totalRefunded)} {currency}
                  </p>
                </div>
                {debtSummary.totalDebt > 0 && (
                  <div className={styles.priorityChartCard}>
                    <p className={styles.chartTitle}>Debt by priority</p>
                    {/* thickness === size/2 makes the ring's inner edge meet
                        the center exactly — a full pie, no donut hole. */}
                    <DonutChart segments={prioritySegments} size={112} thickness={56} legendPosition="bottom" />
                  </div>
                )}
              </div>
            </>
          )}
          {totalDebtTrend.length > 0 && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{strings.goals.totalDebtTrendTitle}</p>
              <TrendChart
                points={totalDebtTrend.map((point) => ({ label: point.label, value: point.total }))}
                color="var(--color-danger)"
              />
            </div>
          )}
          {debts.length === 0 ? (
            <p className={styles.emptyText}>{strings.goals.emptyDebt}</p>
          ) : (
            <div className={styles.list}>
              {debts.map((debt) => (
                <div
                  key={debt.id}
                  role="button"
                  tabIndex={0}
                  className={styles.card}
                  onClick={() => router.push(`/debts/${debt.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/debts/${debt.id}`);
                    }
                  }}
                >
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.cardText}>
                      <p className={styles.cardName}>{debt.name}</p>
                      <p className={styles.cardCategory}>
                        <span className={`${styles.priorityDot} ${styles[`priorityDot_${debt.priority}`]}`} />{' '}
                        {strings.goals[PRIORITY_LABEL_KEY[debt.priority]]}
                      </p>
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                      <ActionMenu
                        title={debt.name}
                        ariaLabel={`Actions for ${debt.name}`}
                        items={[
                          {
                            key: 'archive',
                            label: strings.goals.archiveAction,
                            icon: <Trash2 size={16} strokeWidth={1.75} />,
                            onSelect: () => setConfirmDebtId(debt.id),
                            danger: true,
                          },
                        ]}
                      />
                    </span>
                  </div>
                  <div className={styles.track}>
                    <div className={styles.fill} style={{ width: `${debt.percent}%` }} />
                  </div>
                  <div className={styles.amountRow}>
                    <span className={styles.amountValue}>
                      {formatAmount(debt.balance)} {currency}
                    </span>
                    <span className={styles.amountMuted}>{debt.percent}%</span>
                  </div>
                  {debt.nextPaymentDate && (
                    <div className={styles.metaRow}>
                      <span>
                        {strings.goals.nextPaymentPrefix}{' '}
                        {debt.nextPaymentDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {debtSummary.debtCount === 0 && (
            <button type="button" className={styles.addButton} onClick={() => router.push('/debts/new')}>
              <Plus size={18} strokeWidth={2.25} />
              {strings.goals.addDebt}
            </button>
          )}
        </>
      )}

      {confirmDebtId && (
        <ConfirmDialog
          title={strings.goals.archiveDebtConfirmTitle}
          message={strings.goals.archiveDebtConfirmMessage}
          confirmLabel={strings.goals.archiveAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            archiveDebt(confirmDebtId);
            setConfirmDebtId(null);
          }}
          onCancel={() => setConfirmDebtId(null)}
        />
      )}
    </div>
  );
}
