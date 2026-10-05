'use client';

// A wallet on a phone (BASELINE): balance, committed this month, free after
// commitments and last reconciled as rows, then its charts, transactions
// and upcoming payments.

import Link from 'next/link';
import { ChevronLeft, Settings } from 'lucide-react';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { useLogic, formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from '@/src/phone/screens/WalletDetail/WalletDetailScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

export function WalletDetailScreen({ walletId }: { walletId: string }) {
  const formLink = useFormLink();
  const strings = useStrings();
  const {
    wallet,
    balance,
    lockedAmount,
    availableAmount,
    currency,
    transactions,
    period,
    setPeriod,
    cashflow,
    cashflowMax,
    spendingTrend,
    transferDestinations,
    upcomingTotal,
    upcomingShortfall,
    upcomingHorizonDays,
    loading,
    error,
    goBack,
    iconFor,
    committed,
    free,
    lastReconciled,
  } = useLogic(walletId, strings.walletDetail.periods);

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={wallet?.name ?? '…'}
        right={
          <Link href={formLink('wallet', { id: walletId })} className={styles.editButton} aria-label={strings.walletDetail.editWallet}>
            <Settings size={18} strokeWidth={1.75} />
          </Link>
        }
      />

      <p className={styles.balance}>
        {formatAmount(balance)} <span className={styles.balanceCurrency}>{currency}</span>
      </p>

      {lockedAmount > 0 && (
        <p className={styles.availableCaption}>
          {strings.walletDetail.availablePrefix} {formatAmount(availableAmount)} {currency}
        </p>
      )}

      {(wallet?.frozen || wallet?.notSpendable || lockedAmount > 0) && (
        <div className={styles.badgeRow}>
          {wallet?.frozen && <span className={styles.badgeFrozen}>{strings.walletDetail.frozenBadge}</span>}
          {wallet?.notSpendable && (
            <span className={styles.badgeNotSpendable}>{strings.walletDetail.notSpendableBadge}</span>
          )}
          {lockedAmount > 0 && (
            <span className={styles.badgeLocked}>
              {formatAmount(lockedAmount)} {currency} {strings.walletDetail.lockedBadgeSuffix}
            </span>
          )}
        </div>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && wallet && (
        <div className={styles.figureRows}>
          <div className={styles.figureRow}>
            <span>Committed this month</span>
            <span>
              {formatAmount(committed)} {currency}
            </span>
          </div>
          <div className={styles.figureRow}>
            <span>Free after commitments</span>
            <span data-tone={free < 0 ? 'bad' : undefined}>
              {formatAmount(free)} {currency}
            </span>
          </div>
          <div className={styles.figureRow}>
            <span>Last reconciled</span>
            <span>{lastReconciled ? lastReconciled.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</span>
          </div>
        </div>
      )}

      {!loading && !error && wallet && (
        <>
          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>{strings.walletDetail.cashflowTitle}</p>
            <div className={styles.cashflowChart}>
              {cashflow.map((entry, index) => (
                <div key={index} className={styles.cashflowColumn}>
                  <div className={styles.cashflowBars}>
                    <div
                      className={styles.cashflowBarIn}
                      style={{ height: `${Math.max((entry.inflow / cashflowMax) * 100, entry.inflow > 0 ? 4 : 0)}%` }}
                    />
                    <div
                      className={styles.cashflowBarOut}
                      style={{ height: `${Math.max((entry.outflow / cashflowMax) * 100, entry.outflow > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className={styles.cashflowLabel}>{entry.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendDotIn}`} />
                {strings.walletDetail.cashflowLegendIn}
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendDotOut}`} />
                {strings.walletDetail.cashflowLegendOut}
              </span>
            </div>
          </div>

          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>{strings.walletDetail.spendingTrendTitle}</p>
            <TrendChart points={spendingTrend} color="var(--color-danger)" />
          </div>

          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>{strings.walletDetail.transferDestinationsTitle}</p>
            {transferDestinations.length > 0 ? (
              <DonutChart segments={transferDestinations} />
            ) : (
              <p className={styles.emptyText}>{strings.walletDetail.emptyTransferDestinations}</p>
            )}
          </div>

          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>
              {strings.walletDetail.upcomingPaymentsTitle} ({upcomingHorizonDays}d)
            </p>
            {upcomingTotal > 0 ? (
              <>
                <p className={styles.upcomingAmount}>
                  {formatAmount(upcomingTotal)} {currency}
                </p>
                <p className={upcomingShortfall > 0 ? styles.upcomingShort : styles.upcomingOk}>
                  {upcomingShortfall > 0
                    ? `${strings.walletDetail.upcomingPaymentsShortPrefix} ${formatAmount(upcomingShortfall)} ${currency}`
                    : strings.walletDetail.upcomingPaymentsCovered}
                </p>
              </>
            ) : (
              <p className={styles.emptyText}>{strings.walletDetail.upcomingPaymentsNone}</p>
            )}
          </div>
        </>
      )}

      <div className={styles.periodTabs}>
        {strings.walletDetail.periods.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.periodTab} ${period === option ? styles.periodTabActive : ''}`}
            onClick={() => setPeriod(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {transactions.map((transaction, index) => {
          const Icon = iconFor(index);
          return (
            <div key={transaction.id} className={styles.card}>
              <span className={styles.icon} style={{ background: transaction.iconColor }}>
                <Icon size={16} strokeWidth={2} color="#ffffff" />
              </span>
              <div className={styles.info}>
                <p className={styles.transactionTitle}>{transaction.title}</p>
                <p className={styles.date}>{transaction.date}</p>
              </div>
              <span className={styles.amount}>
                {formatAmount(transaction.amount)} {transaction.currency}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
