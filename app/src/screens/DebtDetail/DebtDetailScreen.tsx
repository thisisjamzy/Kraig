'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trash2, Pencil } from 'lucide-react';
import { useLogic } from '@/src/logic/debtDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import styles from './DebtDetailScreen.module.css';

const INTERVAL_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const TREND_COLOR: Record<string, string> = {
  high: 'var(--color-danger)',
  medium: '#e8a33d',
  low: 'var(--color-brand)',
};

export function DebtDetailScreen({ debtId }: { debtId: string }) {
  const strings = useStrings();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { debt, currency, percent, nextPaymentDate, remaining, repayments, trend, archiveDebt, goBack, loading, error } =
    useLogic(debtId);

  const trendColor = TREND_COLOR[debt?.priority ?? 'medium'];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.debtDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.debtDetail.headerTitle}</h1>
        {debt && (
          <>
            <Link href={`/debts/${debtId}/edit`} className={styles.editButton} aria-label={strings.debtDetail.editDebt}>
              <Pencil size={14} strokeWidth={1.75} />
            </Link>
            <button
              type="button"
              className={styles.archiveButton}
              onClick={() => setConfirmArchive(true)}
              aria-label={strings.debtDetail.archiveDebt}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </>
        )}
      </header>

      {debt && <p className={styles.debtName}>{debt.name}</p>}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && debt && (
        <>
          <div className={styles.badgeRow}>
            <span className={styles.typeBadge}>
              {debt.debtType === 'cash' ? strings.debtDetail.typeCash : strings.debtDetail.typeExisting}
            </span>
            <span className={`${styles.priorityBadge} ${styles[`priorityBadge_${debt.priority}`]}`}>
              {strings.goals[debt.priority === 'high' ? 'priorityHigh' : debt.priority === 'medium' ? 'priorityMedium' : 'priorityLow']}
            </span>
          </div>

          <div className={styles.balanceCard}>
            <p className={styles.balanceHeadline}>
              {formatAmount(remaining)} {currency}
            </p>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <div className={styles.amountRow}>
              <span>
                {strings.debtDetail.principalLabel}:{' '}
                <span className={styles.amountValue}>
                  {formatAmount(debt.principalAmount)} {currency}
                </span>
              </span>
              <span>
                {strings.debtDetail.repaidLabel}:{' '}
                <span className={styles.amountValue}>
                  {formatAmount(debt.totalRepaid)} {currency} ({percent}%)
                </span>
              </span>
            </div>
          </div>

          <div className={styles.planCard}>
            <div className={styles.sectionTitleRow}>
              <p className={styles.sectionTitle}>{strings.debtDetail.paymentPlanLabel}</p>
              <Link href={`/debts/${debtId}/plan`} className={styles.addLink}>
                {strings.debtDetail.editPlan}
              </Link>
            </div>
            {debt.paymentPlan.type === 'recurring' && debt.paymentPlan.recurring ? (
              <>
                <div className={styles.planRow}>
                  <span>{strings.recordRepayment.amountLabel}</span>
                  <span className={styles.amountValue}>
                    {formatAmount(debt.paymentPlan.recurring.amount)} {currency}
                  </span>
                </div>
                <div className={styles.planRow}>
                  <span>{strings.createDebt.recurringIntervalLabel}</span>
                  <span className={styles.amountValue}>{INTERVAL_LABEL[debt.paymentPlan.recurring.interval]}</span>
                </div>
                {nextPaymentDate && (
                  <div className={styles.planRow}>
                    <span>{strings.debtDetail.nextPaymentPrefix}</span>
                    <span className={styles.amountValue}>
                      {nextPaymentDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.emptyText}>{strings.debtDetail.noPaymentPlan}</p>
            )}
          </div>

          {trend.length > 0 && (
            <div className={styles.trendCard}>
              <p className={styles.sectionTitle}>{strings.debtDetail.trendTitle}</p>
              <TrendChart points={trend.map((point) => ({ label: point.label, value: point.balance }))} color={trendColor} />
            </div>
          )}

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>{strings.debtDetail.repaymentHistory}</h2>
            <Link href={`/debts/${debtId}/repay`} className={styles.addLink}>
              {strings.debtDetail.recordRepayment}
            </Link>
          </div>

          {repayments.length === 0 ? (
            <p className={styles.emptyText}>{strings.debtDetail.emptyRepayments}</p>
          ) : (
            <div className={styles.list}>
              {repayments.map((repayment) => (
                <div key={repayment.id} className={styles.repaymentRow}>
                  <div className={styles.repaymentTopRow}>
                    <span className={styles.repaymentDate}>
                      {repayment.date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </span>
                    <span className={styles.repaymentAmount}>
                      {formatAmount(repayment.amount)} {currency}
                    </span>
                  </div>
                  {repayment.notes && <p className={styles.repaymentMeta}>{repayment.notes}</p>}
                  <p className={styles.repaymentMeta}>
                    {repayment.transactionId ? strings.debtDetail.linkedToWallet : strings.debtDetail.notLinked}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={strings.goals.archiveDebtConfirmTitle}
          message={strings.goals.archiveDebtConfirmMessage}
          confirmLabel={strings.debtDetail.archiveDebt}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            setConfirmArchive(false);
            archiveDebt();
          }}
          onCancel={() => setConfirmArchive(false)}
        />
      )}
    </div>
  );
}
