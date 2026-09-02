'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/goals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import styles from './GoalsScreen.module.css';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

const PRIORITY_LABEL_KEY = { high: 'priorityHigh', medium: 'priorityMedium', low: 'priorityLow' } as const;

export function GoalsScreen() {
  const router = useRouter();
  const strings = useStrings();
  const { tab, setTab, currency, goals, debts, debtSummary, totalDebtTrend, archiveGoal, archiveDebt, loading, error } =
    useLogic();

  const [confirmGoalId, setConfirmGoalId] = useState<string | null>(null);
  const [confirmDebtId, setConfirmDebtId] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.periodTabs}>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'goals' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('goals')}
        >
          {strings.goals.tabGoals}
        </button>
        <button
          type="button"
          className={`${styles.periodTab} ${tab === 'debt' ? styles.periodTabActive : ''}`}
          onClick={() => setTab('debt')}
        >
          {strings.goals.tabDebt}
        </button>
      </div>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && tab === 'goals' && (
        <>
          {goals.length === 0 ? (
            <p className={styles.emptyText}>{strings.goals.emptyGoals}</p>
          ) : (
            <div className={styles.list}>
              {goals.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  className={styles.card}
                  onClick={() => router.push(`/goals/${goal.id}`)}
                >
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.cardText}>
                      <p className={styles.cardName}>{goal.name}</p>
                      <p className={styles.cardCategory}>
                        {goal.completedLineItemCount}/{goal.lineItemCount} {strings.goals.itemsDone}
                      </p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      className={styles.iconButtonDanger}
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmGoalId(goal.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.stopPropagation();
                          event.preventDefault();
                          setConfirmGoalId(goal.id);
                        }
                      }}
                      aria-label={`${strings.goals.archiveAction} ${goal.name}`}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </span>
                  </div>
                  <div className={styles.track}>
                    <div className={styles.fill} style={{ width: `${goal.percent}%` }} />
                  </div>
                  <div className={styles.amountRow}>
                    <span className={styles.amountValue}>
                      {formatAmount(goal.completed)} {currency}
                    </span>
                    <span className={styles.amountMuted}>
                      {strings.goals.completedOfSuffix} {formatAmount(goal.total)} {currency} &bull; {goal.percent}%
                    </span>
                  </div>
                  {goal.deadline && (
                    <div className={styles.metaRow}>
                      <span>
                        {strings.goals.deadlinePrefix}{' '}
                        {goal.deadline.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          <button type="button" className={styles.addButton} onClick={() => router.push('/goals/new')}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.goals.addGoal}
          </button>
        </>
      )}

      {!loading && !error && tab === 'debt' && (
        <>
          {debtSummary.debtCount > 0 && (
            <div className={styles.summaryCard}>
              <div className={styles.summaryTotalRow}>
                <span className={styles.amountMuted}>{strings.goals.totalDebtLabel}</span>
                <span className={styles.summaryTotalValue}>
                  {formatAmount(debtSummary.totalDebt)} {currency}
                </span>
              </div>
              <div className={styles.priorityRow}>
                {(['high', 'medium', 'low'] as const).map((priority) => (
                  <div key={priority} className={styles.priorityChip}>
                    <span className={`${styles.priorityDot} ${styles[`priorityDot_${priority}`]}`} />
                    <span>{strings.goals[PRIORITY_LABEL_KEY[priority]]}</span>
                    <span className={styles.amountMuted}>
                      {formatAmount(debtSummary.byPriority[priority])} {currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {totalDebtTrend.length > 0 && (
            <div className={styles.summaryCard}>
              <p className={styles.trendTitle}>{strings.goals.totalDebtTrendTitle}</p>
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
                <button
                  key={debt.id}
                  type="button"
                  className={styles.card}
                  onClick={() => router.push(`/debts/${debt.id}`)}
                >
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.cardText}>
                      <p className={styles.cardName}>{debt.name}</p>
                      <p className={styles.cardCategory}>
                        <span className={`${styles.priorityDot} ${styles[`priorityDot_${debt.priority}`]}`} />{' '}
                        {strings.goals[PRIORITY_LABEL_KEY[debt.priority]]}
                      </p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      className={styles.iconButtonDanger}
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmDebtId(debt.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.stopPropagation();
                          event.preventDefault();
                          setConfirmDebtId(debt.id);
                        }
                      }}
                      aria-label={`${strings.goals.archiveAction} ${debt.name}`}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </span>
                  </div>
                  <div className={styles.track}>
                    <div className={styles.fill} style={{ width: `${debt.percent}%` }} />
                  </div>
                  <div className={styles.amountRow}>
                    <span className={styles.amountValue}>
                      {formatAmount(debt.balance)} {currency}
                    </span>
                    <span className={styles.amountMuted}>
                      {strings.goals.completedOfSuffix} {formatAmount(debt.principal)} {currency} &bull; {debt.percent}%
                    </span>
                  </div>
                  {debt.nextPaymentDate && (
                    <div className={styles.metaRow}>
                      <span>
                        {strings.goals.nextPaymentPrefix}{' '}
                        {debt.nextPaymentDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          <button type="button" className={styles.addButton} onClick={() => router.push('/debts/new')}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.goals.addDebt}
          </button>
        </>
      )}

      {confirmGoalId && (
        <ConfirmDialog
          title={strings.goals.archiveGoalConfirmTitle}
          message={strings.goals.archiveGoalConfirmMessage}
          confirmLabel={strings.goals.archiveAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            archiveGoal(confirmGoalId);
            setConfirmGoalId(null);
          }}
          onCancel={() => setConfirmGoalId(null)}
        />
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
