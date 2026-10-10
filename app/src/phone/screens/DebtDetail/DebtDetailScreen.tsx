'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trash2, Pencil } from 'lucide-react';
import { useLogic } from '@/src/phone/logic/debtDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { formatAmount } from '@/src/phone/screens/Buckets/BucketsScreen';
import { debtScheduleRows } from '@/src/logic/debtDetail/schedule';
import { useAccounts } from '@/src/shared/firestore/queries';
import styles from '@/src/phone/screens/DebtDetail/DebtDetailScreen.module.css';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

const INTERVAL_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const TREND_COLOR: Record<string, string> = {
  high: 'var(--color-danger)',
  medium: styleGuide.brand.accent,
  low: 'var(--color-brand)',
};

export function DebtDetailScreen({ debtId }: { debtId: string }) {
  const strings = useStrings();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { debt, currency, percent, nextPaymentDate, remaining, repayments, trend, archiveDebt, goBack, loading, error } =
    useLogic(debtId);

  const trendColor = TREND_COLOR[debt?.priority ?? 'medium'];
  const { data: accounts } = useAccounts();
  const schedule = debtScheduleRows(debt ?? null, (p) =>
    !p ? null : p.kind === 'account' ? (accounts.find((a) => a.id === p.accountId)?.name ?? 'An account') : p.kind === 'anyIncome' ? 'Any income' : p.kind === 'savings' ? 'Savings' : 'Income'
  );
  const shortDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.debtDetail.backLabel}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.debtDetail.headerTitle}
        right={
          debt && (
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
          )
        }
      />

      {debt && <p className={styles.debtName}>{debt.name}</p>}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && debt && (
        <>
          <div className={styles.badgeRow}>
            <span className={styles.typeBadge}>
              {debt.debtType === 'cash' ? strings.debtDetail.typeCash : strings.debtDetail.typeExisting}
            </span>
            <span className={`${styles.priorityBadge} ${styles[`priorityBadge_${debt.priority}`]}`}>
              {strings.buckets[debt.priority === 'high' ? 'priorityHigh' : debt.priority === 'medium' ? 'priorityMedium' : 'priorityLow']}
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

          <div className={styles.planCard}>
            <div className={styles.sectionTitleRow}>
              <p className={styles.sectionTitle}>Scheduled repayments</p>
              {remaining > 0 && (
                <Link href={`/debts/${debtId}/schedule`} className={styles.addLink}>
                  Plan a repayment
                </Link>
              )}
            </div>
            {schedule.scheduled.length ? (
              schedule.scheduled.map((r) => (
                <Link
                  key={r.id}
                  href={r.recorded ? `/debts/${debtId}` : r.budgetLine ? `/debts/${debtId}/schedule?scheduled=${r.id}` : `/debts/${debtId}/repay?amount=${r.amount}&scheduled=${r.id}`}
                  className={styles.planRow}
                >
                  <span>
                    {shortDay(r.date)} · {r.recorded ? 'Recorded' : r.everything ? 'Everything left' : 'Scheduled'}
                    {r.from ? ` · ${r.from}` : ''}
                  </span>
                  <span className={styles.amountValue}>
                    {formatAmount(r.amount)} {currency}
                  </span>
                </Link>
              ))
            ) : (
              <p className={styles.emptyText}>A one-off repayment on a date, for a set amount or everything left.</p>
            )}
            {schedule.overBy > 0 && (
              <p className={styles.emptyText}>
                These add up to {formatAmount(schedule.overBy)} {currency} more than what you owe.
              </p>
            )}
          </div>

          {schedule.upcoming.length > 0 && (
            <div className={styles.planCard}>
              <p className={styles.sectionTitle}>Upcoming repayments</p>
              {schedule.upcoming.map((u) => (
                <div key={u.key} className={styles.planRow}>
                  <span>
                    {shortDay(u.date)} · {u.kind === 'repeating' ? 'Repeating plan' : 'Scheduled'}
                  </span>
                  <span className={styles.amountValue}>
                    {formatAmount(u.amount)} {currency}
                  </span>
                </div>
              ))}
            </div>
          )}

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
          title={strings.buckets.archiveDebtConfirmTitle}
          message={strings.buckets.archiveDebtConfirmMessage}
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
