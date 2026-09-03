'use client';

import Link from 'next/link';
import { Plus, SlidersHorizontal, History, ArrowUpRight, Check, ChevronDown, Search } from 'lucide-react';
import { useLogic, formatAmount, formatCompact, type SpendingPeriod } from '@/src/logic/home/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import styles from './HomeScreen.module.css';

// Colorless placeholder shapes shown while a chart has no real data yet (or
// is still loading) — reserves the same vertical space the real chart would
// take instead of the section collapsing to nothing, then jumping once data
// arrives.
const PLACEHOLDER_BAR_HEIGHTS = [55, 80, 40, 65];
const PLACEHOLDER_BREAKDOWN_COLUMNS = 6;
const PLACEHOLDER_BUDGET_ROWS = [60, 35, 80];

export function HomeScreen() {
  const strings = useStrings();
  const {
    balance,
    wallets,
    budgets,
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
    { label: strings.home.quickActionSeeBudget, icon: SlidersHorizontal, href: '/budget' },
    { label: strings.home.quickActionHistory, icon: History, href: '/transactions' },
  ];

  const periods: { key: SpendingPeriod; label: string }[] = [
    { key: 'week', label: strings.home.periodWeek },
    { key: 'month', label: strings.home.periodMonth },
    { key: 'quarter', label: strings.home.periodQuarter },
  ];

  const swipeRef = useSwipeModeSwitch('money');

  return (
    <div className={styles.page} ref={swipeRef}>
      <ScreenState loading={loading} error={error} />

      <section className={styles.balanceCard}>
        <div className={styles.balanceTopRow}>
          <span className={styles.balanceLabel}>{strings.home.balanceLabel}</span>
          <button
            type="button"
            className={styles.currencyChip}
            onClick={() => setCurrencyPickerOpen(true)}
          >
            {balance.currency}
            <ChevronDown size={12} strokeWidth={2.5} />
          </button>
        </div>
        <p className={styles.balanceAmount}>{formatAmount(balance.total)}</p>
        <div className={styles.spendableRow}>
          <span className={styles.balanceLabel}>{strings.home.spendableLabel}</span>
          <span className={styles.spendableChip}>
            {formatAmount(balance.spendable)} {balance.currency}
          </span>
        </div>

        <div className={styles.quickActions}>
          {quickActions.map(({ label, icon: Icon, href }) => (
            <Link key={label} href={href} className={styles.quickAction}>
              <span className={styles.quickActionIcon}>
                <Icon size={18} strokeWidth={1.75} />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </section>

      {currencyPickerOpen && (
        <Modal title={strings.home.chooseCurrency} onClose={() => setCurrencyPickerOpen(false)}>
          <div className={styles.searchRow}>
            <Search size={16} strokeWidth={2} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder={strings.home.searchCurrenciesPlaceholder}
              value={currencySearch}
              onChange={(event) => setCurrencySearch(event.target.value)}
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
        </Modal>
      )}

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
          <h2 className={styles.sectionTitle}>{strings.home.budgets}</h2>
          <Link href="/budget" className={styles.viewAllButton} aria-label="View all budgets">
            <ArrowUpRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {budgets.length > 0 ? (
          <div className={styles.budgetList}>
            {budgets.map((budget) => {
              const percent = Math.min((budget.spent / budget.total) * 100, 100);
              return (
                <div key={budget.category} className={styles.budgetRow}>
                  <div className={styles.budgetInfo}>
                    <span className={styles.budgetCategory}>{budget.category}</span>
                    <span className={styles.budgetAmount}>
                      {formatAmount(budget.spent)} / {formatAmount(budget.total)} {balance.currency}
                    </span>
                  </div>
                  <div className={styles.budgetTrack}>
                    <div className={styles.budgetFill} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.budgetList} aria-hidden="true">
            {PLACEHOLDER_BUDGET_ROWS.map((width, index) => (
              <div key={index} className={styles.budgetRow}>
                <div className={styles.budgetInfo}>
                  <span className={`${styles.budgetCategory} ${styles.placeholderLabel}`} style={{ width: 64 }} />
                  <span className={`${styles.budgetAmount} ${styles.placeholderLabel}`} style={{ width: 48 }} />
                </div>
                <div className={styles.budgetTrack}>
                  <div className={styles.placeholderBar} style={{ width: `${width}%`, height: '100%' }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {budgets.length === 0 && !loading && <p className={styles.emptyText}>{strings.home.noBudgets}</p>}
      </section>
    </div>
  );
}
