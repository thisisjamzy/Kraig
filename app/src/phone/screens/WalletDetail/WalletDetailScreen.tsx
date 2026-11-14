'use client';

// A wallet on a phone (BASELINE): balance, committed this month, free after
// commitments and last reconciled as rows, then its charts, upcoming payments
// and every transaction and transfer on it, with the all-transactions
// page's filters.

import Link from 'next/link';
import { ChevronLeft, ChevronRight, History, Settings } from 'lucide-react';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { useLogic, formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useWalletHistory } from '@/src/logic/walletDetail/useHistory';
import { HistoryView } from '@/src/phone/screens/Planning/HistoryView';
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
    committed,
    free,
    lastReconciled,
    share,
    untracked,
    usage,
    historyMonths,
  } = useLogic(walletId);
  const h = useWalletHistory(walletId);

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

      {!loading && !error && wallet && untracked && (
        <Link href={`/wallets/${encodeURIComponent(walletId)}/audit`} className={styles.untracked}>
          <History size={18} strokeWidth={1.75} aria-hidden className={styles.untrackedIcon} />
          <span>
            <strong>
              {formatAmount(untracked.amount)} {currency} left this wallet this year with no record
            </strong>
            <span>
              That is {Math.round(untracked.share * 100)}% of everything untracked this year.
              {untracked.latestAt && untracked.latestMatched ? ' The last count matched, so the gap sits in the months before it.' : ''}
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      )}

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
          {share && (
            <div className={styles.figureRow}>
              <span>Share of your money</span>
              <span>
                {Math.round(share.fraction * 100)}% of {share.wallets} {share.wallets === 1 ? 'wallet' : 'wallets'}
              </span>
            </div>
          )}
          <div className={styles.figureRow}>
            <span>Last reconciled</span>
            <span>{lastReconciled ? lastReconciled.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</span>
          </div>
          <Link href={`/wallets/${encodeURIComponent(walletId)}/audit`} className={styles.figureRow}>
            <span>Audit this wallet</span>
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </Link>
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

          {[
            { title: 'What this wallet pays for', sub: `${formatAmount(usage.out.total)} ${currency} out in the last ${historyMonths} months`, rows: usage.out.rows },
            { title: 'Where its money comes from', sub: `${formatAmount(usage.into.total)} ${currency} in over the last ${historyMonths} months`, rows: usage.into.rows },
          ].map((card) => (
            <div key={card.title} className={styles.chartCard}>
              <p className={styles.chartTitle}>{card.title}</p>
              <p className={styles.emptyText}>{card.sub}</p>
              <ul className={styles.usageRows}>
                {card.rows.map((r) => (
                  <li key={r.label}>
                    <span className={styles.usageLabel}>{r.label}</span>
                    <span className={styles.usageAmount}>{formatAmount(r.amount)}</span>
                    <span className={styles.usageTrack} aria-hidden>
                      <span className={styles.usageFill} data-kind={r.kind} style={{ width: `${Math.max(2, r.share * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

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

      {!loading && !error && wallet && (
        <section className={styles.history} aria-label={strings.walletDetail.transactionsTitle}>
          <p className={styles.chartTitle}>{strings.walletDetail.transactionsTitle}</p>
          <ScreenState loading={h.loading} error={h.error ? String(h.error) : null} />
          {!h.loading && !h.error && (
            <>
              <HistoryView rows={h.rows} currency={h.currency} fields={h.fields} list={h.list} stickyTop="var(--header-height)" emptyText={`No transactions in ${wallet.name} yet.`} showYear />
              {h.capped && <p className={styles.emptyText}>Showing the latest transactions. Filter by date to find earlier ones.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
