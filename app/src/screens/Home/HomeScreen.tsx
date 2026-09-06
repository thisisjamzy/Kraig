'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Plus,
  SlidersHorizontal,
  History,
  ArrowUpRight,
  Check,
  ChevronDown,
  Search,
  Wallet,
  PiggyBank,
  CreditCard,
  Pencil,
} from 'lucide-react';
import { useLogic, formatAmount, formatCompact, type SpendingPeriod } from '@/src/logic/home/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Logo } from '@/src/widgets/Logo/Logo';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { iconTint } from '@/src/viewmodels/iconTint';
import styles from './HomeScreen.module.css';
// The Recent Transactions panel uses this exact same card component style
// as the all-transactions list, so it reuses that module's classes
// directly rather than duplicating them (same convention Budget's own
// month-transactions panel already uses).
import cardStyles from '@/src/screens/TransactionHistory/TransactionHistoryScreen.module.css';

// A zeroed-out unaccounted balance is displayed as six asterisks rather than
// "0" — a deliberate "nothing to see here" placeholder distinct from the
// actual figure, per the home card design (Design/screen 6.jpg).
const UNJUSTIFIED_PLACEHOLDER = '******';

// Colorless placeholder shapes shown while a chart has no real data yet (or
// is still loading) — reserves the same vertical space the real chart would
// take instead of the section collapsing to nothing, then jumping once data
// arrives.
const PLACEHOLDER_BAR_HEIGHTS = [55, 80, 40, 65];
const PLACEHOLDER_BREAKDOWN_COLUMNS = 6;
// Three axis indicators (max, half, zero) — same "at least 3, clearly show
// distance from zero" bar as every other chart in the app now follows (see
// src/screens/Statistics/StatisticsScreen.tsx's own AXIS_SCALE).
const AXIS_SCALE = [1, 0.5, 0];

export function HomeScreen() {
  const strings = useStrings();
  const {
    balance,
    wallets,
    recentTransactions,
    period,
    setPeriod,
    upcomingPayments,
    breakdown,
    walletMax,
    breakdownMax,
    loading,
    error,
    currencyPickerOpen,
    setCurrencyPickerOpen,
    currencySearch,
    setCurrencySearch,
    currencyOptions,
    currencySaving,
    currencyError,
    switchCurrency,
  } = useLogic();

  const quickActions: {
    label: string;
    icon: typeof Plus;
    href: string;
  }[] = [
    { label: strings.home.quickActionAddNew, icon: Plus, href: '/add-transaction' },
    { label: strings.home.quickActionHistory, icon: History, href: '/transactions' },
    { label: strings.home.quickActionSeeBudget, icon: SlidersHorizontal, href: '/budget' },
    { label: strings.home.quickActionDebts, icon: CreditCard, href: '/debts' },
  ];

  const periods: { key: SpendingPeriod; label: string }[] = [
    { key: 'week', label: strings.home.periodWeek },
    { key: 'month', label: strings.home.periodMonth },
  ];

  const swipeRef = useSwipeModeSwitch('money');

  // The currency picker is an anchored popover next to its trigger button,
  // not a full-screen Modal — closes on an outside click/tap or Escape,
  // same convention as ActionMenu (src/widgets/ActionMenu).
  const currencyMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!currencyPickerOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(event.target as Node)) {
        setCurrencyPickerOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCurrencyPickerOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [currencyPickerOpen, setCurrencyPickerOpen]);

  return (
    <div className={styles.page} ref={swipeRef}>
      <ScreenState loading={loading} error={error} />

      <section className={styles.balanceCard}>
        <div className={styles.balanceCardTop}>
          <div>
            <p className={styles.balanceAmount}>{formatAmount(balance.total)}</p>
            <span className={styles.balanceLabel}>{strings.home.balanceLabel}</span>
          </div>
          <div className={styles.currencyMenuWrap} ref={currencyMenuRef}>
            <button
              type="button"
              className={styles.currencyChip}
              onClick={() => setCurrencyPickerOpen((current) => !current)}
              aria-expanded={currencyPickerOpen}
            >
              {balance.currency}
              <ChevronDown size={12} strokeWidth={2.5} />
            </button>

            {currencyPickerOpen && (
              <div className={styles.currencyPopover} onClick={(event) => event.stopPropagation()}>
                <div className={styles.searchRow}>
                  <Search size={16} strokeWidth={2} className={styles.searchIcon} />
                  <input
                    className={styles.searchInput}
                    placeholder={strings.home.searchCurrenciesPlaceholder}
                    value={currencySearch}
                    onChange={(event) => setCurrencySearch(event.target.value)}
                    autoFocus
                  />
                </div>
                {currencyError && (
                  <p className={styles.currencyErrorText} role="alert">
                    {currencyError}
                  </p>
                )}
                <div className={styles.currencyList}>
                  {currencyOptions.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      className={styles.currencyRow}
                      disabled={currencySaving}
                      onClick={() => switchCurrency(entry.code)}
                    >
                      <span className={styles.currencyLabelGroup}>
                        <span className={styles.currencyCode}>{entry.code}</span>
                        <span className={styles.currencyName}>{entry.name}</span>
                      </span>
                      {balance.currency === entry.code && <Check size={16} strokeWidth={2.25} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${balance.monthProgress}%` }} />
        </div>

        <Link href="/settings/reconciliation" className={styles.unjustifiedBlock}>
          <span className={styles.unjustifiedLabel}>{strings.home.unjustifiedLabel}</span>
          <div className={styles.balanceCardFooter}>
            <span className={styles.unjustifiedValue}>
              {balance.unjustified === 0
                ? UNJUSTIFIED_PLACEHOLDER
                : `${balance.unjustified > 0 ? '+' : ''}${formatAmount(balance.unjustified)} ${balance.currency}`}
            </span>
            <Logo variant="dark" height={16} className={styles.balanceLogo} />
          </div>
        </Link>
      </section>

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>
            <PiggyBank size={16} strokeWidth={2} />
          </span>
          <span className={styles.summaryLabel}>{strings.home.savingsLabel}</span>
          <span className={styles.summaryValue}>
            {formatAmount(balance.savings)} {balance.currency}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>
            <Wallet size={16} strokeWidth={2} />
          </span>
          <span className={styles.summaryLabel}>{strings.home.spendableLabel}</span>
          <span className={styles.summaryValue}>
            {formatAmount(balance.spendable)} {balance.currency}
          </span>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{strings.home.quickActionsTitle}</h2>
        <div className={styles.quickActions}>
          {quickActions.map(({ label, icon: Icon, href }, index) => (
            <Link key={label} href={href} className={styles.quickAction}>
              <span className={styles.quickActionIcon} style={{ background: iconTint(index) }}>
                <Icon size={18} strokeWidth={1.75} />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.home.wallets}</h2>
          <Link href="/wallets" className={styles.viewAllButton} aria-label="View all wallets">
            <ArrowUpRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        <div className={styles.walletsChart} data-hscroll="true">
          {wallets.length > 0
            ? wallets.map((wallet) => (
                <div key={wallet.id} className={styles.walletColumn}>
                  <div className={styles.walletBarTrack}>
                    <div
                      className={styles.walletBar}
                      style={{
                        height: `${Math.max((wallet.amount / walletMax) * 100, 6)}%`,
                        background: wallet.color,
                      }}
                    >
                      <span className={styles.walletValue}>{formatCompact(wallet.amount)}</span>
                    </div>
                  </div>
                  <span className={styles.walletName}>{wallet.name}</span>
                </div>
              ))
            : PLACEHOLDER_BAR_HEIGHTS.map((height, index) => (
                <div key={index} className={styles.walletColumn} aria-hidden="true">
                  <div className={styles.walletBarTrack}>
                    <div className={`${styles.walletBar} ${styles.placeholderBar}`} style={{ height: `${height}%` }} />
                  </div>
                  <span className={`${styles.walletName} ${styles.placeholderLabel}`}>&nbsp;</span>
                </div>
              ))}
        </div>
        {wallets.length === 0 && !loading && (
          <p className={styles.emptyText}>{strings.home.noWallets}</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.home.upcomingPayments}</h2>
          <Link href="/payments" className={styles.viewAllButton} aria-label="View payments calendar">
            <ArrowUpRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {upcomingPayments.length === 0 ? (
          <p className={styles.emptyText}>{strings.home.noUpcomingPayments}</p>
        ) : (
          <div className={styles.paymentsList}>
            {upcomingPayments.map((payment) => (
              <Link key={payment.id} href="/payments" className={styles.paymentRow}>
                <div className={styles.paymentInfo}>
                  <span className={styles.paymentTitle}>{payment.title}</span>
                  <span className={styles.paymentMeta}>{payment.dueInLabel}</span>
                </div>
                <div className={styles.paymentRight}>
                  <span className={styles.paymentAmount}>{formatAmount(payment.amount)}</span>
                  <span className={styles.paymentDate}>{payment.dueDateLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.home.spendingBreakdown}</h2>
          <div className={styles.periodTabs}>
            {periods.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`${styles.periodTab} ${period === key ? styles.periodTabActive : ''}`}
                onClick={() => setPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.breakdownRow}>
          <div className={styles.breakdownAxis} aria-hidden="true">
            {AXIS_SCALE.map((fraction) => (
              <span key={fraction}>{formatCompact(Math.round(breakdownMax * fraction))}</span>
            ))}
          </div>
          <div className={styles.breakdownArea}>
            <div className={styles.breakdownGridlines} aria-hidden="true">
              {AXIS_SCALE.map((fraction) => (
                <span key={fraction} className={styles.breakdownGridline} />
              ))}
            </div>
            <div className={styles.breakdownChart}>
              {breakdown.length > 0
                ? breakdown.map((entry) => (
                    <div key={entry.day} className={styles.breakdownColumn}>
                      <div className={styles.breakdownBars}>
                        {entry.hasData ? (
                          <>
                            <div
                              className={styles.breakdownBarIncome}
                              style={{ height: `${Math.max((entry.income / breakdownMax) * 100, 4)}%` }}
                            />
                            <div
                              className={styles.breakdownBarExpense}
                              style={{ height: `${Math.max((entry.expense / breakdownMax) * 100, 4)}%` }}
                            />
                          </>
                        ) : (
                          <div className={styles.breakdownBarEmpty} aria-hidden="true" />
                        )}
                      </div>
                      <span className={styles.breakdownLabel}>{entry.day}</span>
                    </div>
                  ))
                : Array.from({ length: PLACEHOLDER_BREAKDOWN_COLUMNS }, (_, index) => (
                    <div key={index} className={styles.breakdownColumn} aria-hidden="true">
                      <div className={styles.breakdownBars}>
                        <div className={styles.placeholderBreakdownBar} style={{ height: '30%' }} />
                        <div className={styles.placeholderBreakdownBar} style={{ height: '18%' }} />
                      </div>
                      <span className={`${styles.breakdownLabel} ${styles.placeholderLabel}`}>&nbsp;</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotIncome}`} />
            {strings.home.legendIncome}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotExpense}`} />
            {strings.home.legendExpense}
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.home.recentTransactionsTitle}</h2>
          <Link href="/transactions" className={styles.viewAllButton} aria-label="View all transactions">
            <ArrowUpRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          !loading && <p className={styles.emptyText}>{strings.home.noRecentTransactions}</p>
        ) : (
          <div className={cardStyles.list}>
            {recentTransactions.map((transaction) => {
              const Icon = transaction.icon;
              return (
                <div key={transaction.id} className={cardStyles.card}>
                  <span className={cardStyles.icon} style={{ background: transaction.iconColor }}>
                    <Icon size={18} strokeWidth={2} color="#ffffff" />
                  </span>
                  <div className={cardStyles.info}>
                    <p className={cardStyles.transactionTitle}>{transaction.title}</p>
                    <p className={cardStyles.description}>{transaction.description}</p>
                    <p className={cardStyles.account}>{transaction.account}</p>
                    <div className={cardStyles.amountRow}>
                      <span className={cardStyles.amount}>
                        {formatAmount(transaction.amount)} {transaction.currency}
                      </span>
                      <span className={cardStyles.date}>{transaction.date}</span>
                    </div>
                  </div>
                  <Link href={transaction.editHref} className={cardStyles.editButton} aria-label="Edit transaction">
                    <Pencil size={14} strokeWidth={1.75} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
