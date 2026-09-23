'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  SlidersHorizontal,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  ChevronDown,
  Search,
  Wallet,
  PiggyBank,
  CreditCard,
  Target,
  Eye,
  EyeOff,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { useLogic, formatAmount, formatCompact, HIDDEN_AMOUNT_PLACEHOLDER, type SpendingPeriod } from '@/src/logic/home/useLogic';
import { round2 } from '@/src/shared/firestore/currency';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Logo } from '@/src/widgets/Logo/Logo';
import { DonutChart } from '@/src/widgets/DonutChart/DonutChart';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { CATEGORY_ICON_COLOR } from '@/src/viewmodels/categories';
import { barHeightPercent, axisValueAt } from '@/src/shared/charts/scale';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import styles from './HomeScreen.module.css';
import webStyles from './HomeScreen.web.module.css';
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
const PLACEHOLDER_BREAKDOWN_COLUMNS = 6;
// Three axis indicators (max, half, zero) — same "at least 3, clearly show
// distance from zero" bar as every other chart in the app now follows (see
// src/screens/Statistics/StatisticsScreen.tsx's own AXIS_SCALE).
const AXIS_SCALE = [1, 0.5, 0];

// Web dashboard's own Statistics donut — a household with a dozen
// categories turns the legend into unreadable clutter, so only the
// biggest few get their own slice; everything past that rolls into one
// "Other" segment rather than being dropped (the donut's total always
// still matches the real month total this way).
const MAX_STATS_SEGMENTS = 4;

// categoryAccentColor()'s own palette is deliberately pale — it's built for
// an icon chip with a dark glyph sitting on top, not a chart segment read
// on its own — so it renders too washed-out on the donut. This is its own
// small, solid ramp instead, assigned by rank (biggest slice first) so the
// most prominent category always gets the strongest color, not whatever a
// category-name hash happens to land on. Pulled from the Money redesign's
// own accent palette (Lunacy/Images/colors.png) rather than the generic
// brand ramp, so the donut reads as part of this page's own color story.
const STATS_CHART_COLORS = ['#0052ff', '#80b1ed', '#ed3e5a', '#5c5f82'];

// Quick Actions' own icon-chip tints — a small local ramp built from the
// Money redesign's palette (Lunacy/Images/colors.png), replacing the
// generic app-wide iconTint() rotation so this page's icon chips read as
// part of its own color story rather than the shared hue set every other
// screen's badges cycle through.
const QUICK_ACTION_TINTS = [
  'var(--money-tint-blue)',
  'color-mix(in srgb, var(--money-lime) 45%, transparent)',
  'var(--money-tint-yellow)',
  'color-mix(in srgb, var(--money-blue-soft) 30%, transparent)',
  'color-mix(in srgb, var(--money-red) 14%, transparent)',
];

// Recent Transactions' own status dot (Lunacy/Images' own "Current
// Priorities" colored-dot rows) — reads the icon useLogic/home already
// picked from TYPE_ICONS by transaction.type, rather than threading the raw
// type string through as a second field, since the icon identity already
// encodes it 1:1.
function transactionDotColor(icon: LucideIcon) {
  if (icon === ArrowDownLeft) return 'var(--money-blue-soft)';
  if (icon === PiggyBank) return 'var(--money-lime)';
  return 'var(--money-red)';
}

function capStatsSegments(
  segments: { label: string; value: number; color: string }[],
  otherLabel: string
) {
  const capped =
    segments.length <= MAX_STATS_SEGMENTS
      ? segments
      : [
          ...segments.slice(0, MAX_STATS_SEGMENTS - 1),
          {
            label: otherLabel,
            value: round2(segments.slice(MAX_STATS_SEGMENTS - 1).reduce((sum, entry) => sum + entry.value, 0)),
            color: '',
          },
        ];
  return capped.map((entry, index) => ({ ...entry, color: STATS_CHART_COLORS[index % STATS_CHART_COLORS.length] }));
}

export function HomeScreen() {
  const strings = useStrings();
  const router = useRouter();
  const isWeb = useIsWeb();
  const {
    balance,
    wallets,
    recentTransactions,
    period,
    setPeriod,
    balancesHidden,
    toggleBalancesHidden,
    upcomingPayments,
    breakdown,
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
    monthBudgeted,
    monthExpenseTotal,
    budgetSpentPercent,
    expenseCategoryBreakdown,
    incomeCategoryBreakdown,
  } = useLogic();

  const quickActions: {
    label: string;
    icon: typeof Plus;
    href: string;
  }[] = [
    { label: strings.home.quickActionAddNew, icon: Plus, href: '/add-transaction' },
    { label: strings.home.quickActionHistory, icon: History, href: '/transactions' },
    { label: strings.home.quickActionSeeBudget, icon: SlidersHorizontal, href: '/budget' },
    { label: strings.home.quickActionGoals, icon: Target, href: '/goals' },
    { label: strings.home.quickActionDebts, icon: CreditCard, href: '/debts' },
  ];

  // Cashflow's own log-scale toggle — a big outlier week/month otherwise
  // flattens every smaller bar to a sliver against a linear axis.
  const [cashflowLogScale, setCashflowLogScale] = useState(false);

  // Web dashboard only — which side of the Statistics donut (Design/web/
  // web1.jpg's own Income/Expense pill tabs) is showing.
  const [statsMode, setStatsMode] = useState<'expense' | 'income'>('expense');

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

  // Mobile only now — the web dashboard replaced this dark gradient hero
  // with its own plain-white Balance stat card (see .statsRow below; that
  // card's currency switcher/hide-toggle/unaccounted-link markup is its own
  // copy, not a call into this function). A plain function returning JSX
  // (not a nested component) so re-renders don't remount it and drop the
  // currency popover's own focus/scroll state.
  function renderBalanceCard() {
    return (
      <section className={styles.balanceCard}>
        <div className={styles.balanceCardTop}>
          <div>
            <div className={styles.balanceAmountRow}>
              <p className={styles.balanceAmount}>
                {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatAmount(balance.total)}
              </p>
              <button
                type="button"
                className={styles.balanceVisibilityToggle}
                onClick={toggleBalancesHidden}
                aria-label={balancesHidden ? strings.home.showBalances : strings.home.hideBalances}
                aria-pressed={balancesHidden}
              >
                {balancesHidden ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
              </button>
            </div>
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
    );
  }

  // Shared between mobile and the web dashboard, same reasoning as
  // renderBalanceCard() above — cashflow's own chart isn't part of what the
  // user asked to redesign, just reposition.
  function renderCashflowSection() {
    // Web only (Lunacy/Images' own "Current Sprint Progress" date-range
    // subtitle) — a real, computed range, not a placeholder: the exact 7
    // calendar days rangeStartFor('week') in useLogic queries, or the
    // current month name for 'month'.
    const rangeLabel =
      period === 'week' ? 'The last 7 days' : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
      <section className={`${styles.section} ${isWeb ? webStyles.areaChart : ''}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={`${styles.sectionTitle} ${isWeb ? webStyles.sectionTitleRich : ''}`}>
              {strings.home.spendingBreakdown}
            </h2>
            {isWeb && <p className={webStyles.sectionSubtitle}>{rangeLabel}</p>}
          </div>
          <div className={styles.headerControls}>
            {isWeb && (
              <div className={webStyles.legendPills}>
                <span className={webStyles.legendPill}>
                  <span className={`${styles.legendDot} ${styles.legendDotIncome}`} />
                  {strings.home.legendIncome}
                </span>
                <span className={webStyles.legendPill}>
                  <span className={`${styles.legendDot} ${styles.legendDotExpense}`} />
                  {strings.home.legendExpense}
                </span>
              </div>
            )}
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
            <div className={styles.periodTabs}>
              <button
                type="button"
                className={`${styles.periodTab} ${!cashflowLogScale ? styles.periodTabActive : ''}`}
                onClick={() => setCashflowLogScale(false)}
              >
                {strings.common.scaleLinear}
              </button>
              <button
                type="button"
                className={`${styles.periodTab} ${cashflowLogScale ? styles.periodTabActive : ''}`}
                onClick={() => setCashflowLogScale(true)}
              >
                {strings.common.scaleLog}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.breakdownRow}>
          <div className={styles.breakdownAxis} aria-hidden="true">
            {AXIS_SCALE.map((fraction) => (
              <span key={fraction}>{formatCompact(Math.round(axisValueAt(fraction, breakdownMax, cashflowLogScale)))}</span>
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
                              style={{ height: `${barHeightPercent(entry.income, breakdownMax, cashflowLogScale, 4)}%` }}
                            />
                            <div
                              className={styles.breakdownBarExpense}
                              style={{ height: `${barHeightPercent(entry.expense, breakdownMax, cashflowLogScale, 4)}%` }}
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

        {!isWeb && (
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
        )}
      </section>
    );
  }

  // Shared between mobile and the web dashboard, same reasoning as above —
  // not part of what the user asked to redesign, just reposition.
  function renderUpcomingPaymentsSection() {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={`${styles.sectionTitle} ${isWeb ? webStyles.sectionTitleRich : ''}`}>{strings.home.upcomingPayments}</h2>
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
    );
  }

  if (isWeb) {
    const statsSegments = capStatsSegments(
      statsMode === 'expense' ? expenseCategoryBreakdown : incomeCategoryBreakdown,
      strings.home.otherCategoryLabel
    );
    const statsTotal = round2(statsSegments.reduce((sum, entry) => sum + entry.value, 0));

    return (
      <div className={webStyles.dashboard} ref={swipeRef}>
        <ScreenState loading={loading} error={error} />

        {!loading && !error && (
          <>
            {/* Four equal stat cards (Lunacy/Images' own "Active Areas/
                Ongoing Projects/Pending Task/Overdue Task" row) — a big bold
                figure, a pastel rounded-square icon badge, a title and a
                real one-line description, no card given special dark/hero
                treatment over the others. Balance keeps its currency
                switcher, hide-balances toggle and unaccounted-for link
                (mobile's own hero card still carries all three in full) —
                tucked into a compact meta row under its description instead
                of a full gradient hero, since the reference gives every
                stat card the same plain-white shape. */}
            <div className={webStyles.statsRow}>
              <div className={webStyles.statCard}>
                <span className={webStyles.statIcon} style={{ background: 'var(--money-tint-blue)', color: 'var(--money-blue)' }}>
                  <Wallet size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.statValue}>
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatAmount(balance.total)}
                </p>
                <p className={webStyles.statTitle}>{strings.home.balanceLabel}</p>
                <p className={webStyles.statDescription}>{strings.home.statBalanceDescription}</p>

                <div className={webStyles.statMetaRow}>
                  <div className={styles.currencyMenuWrap} ref={currencyMenuRef}>
                    <button
                      type="button"
                      className={webStyles.statCurrencyChip}
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
                  <button
                    type="button"
                    className={webStyles.statEyeToggle}
                    onClick={toggleBalancesHidden}
                    aria-label={balancesHidden ? strings.home.showBalances : strings.home.hideBalances}
                    aria-pressed={balancesHidden}
                  >
                    {balancesHidden ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                  </button>
                </div>
                <Link href="/settings/reconciliation" className={webStyles.statSubLink}>
                  {strings.home.unjustifiedLabel}:{' '}
                  {balance.unjustified === 0
                    ? UNJUSTIFIED_PLACEHOLDER
                    : `${balance.unjustified > 0 ? '+' : ''}${formatAmount(balance.unjustified)} ${balance.currency}`}
                </Link>
              </div>

              <div className={webStyles.statCard}>
                <span className={webStyles.statIcon} style={{ background: 'var(--money-tint-yellow)', color: 'var(--money-ink)' }}>
                  <PiggyBank size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.statValue}>
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatAmount(balance.savings)}
                </p>
                <p className={webStyles.statTitle}>{strings.home.savingsLabel}</p>
                <p className={webStyles.statDescription}>{strings.home.statSavingsDescription}</p>
              </div>

              <div className={webStyles.statCard}>
                <span
                  className={webStyles.statIcon}
                  style={{ background: 'color-mix(in srgb, var(--money-lime) 45%, transparent)', color: 'var(--money-ink)' }}
                >
                  <CreditCard size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.statValue}>
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatAmount(balance.spendable)}
                </p>
                <p className={webStyles.statTitle}>{strings.home.spendableLabel}</p>
                <p className={webStyles.statDescription}>{strings.home.statSpendableDescription}</p>
              </div>

              <div className={webStyles.statCard}>
                <span
                  className={webStyles.statIcon}
                  style={{ background: 'color-mix(in srgb, var(--money-red) 14%, transparent)', color: 'var(--money-red)' }}
                >
                  <ArrowUpRight size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.statValue}>
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatAmount(monthExpenseTotal)}
                </p>
                <p className={webStyles.statTitle}>{strings.home.monthExpensesLabel}</p>
                <p className={webStyles.statDescription}>{strings.home.statExpensesDescription}</p>
              </div>
            </div>

            {/* Colorful highlight row (Lunacy/Images' own lime "Areas" +
                blue "Network" + red "Next Milestone" cards) — reinterpreted
                for Money as three real, live figures rather than filler
                copy: net savings, a wallet count, and the single soonest
                upcoming payment. */}
            <div className={webStyles.highlightRow}>
              <div className={`${webStyles.highlightCard} ${webStyles.highlightLime}`}>
                <span className={webStyles.highlightIcon}>
                  <PiggyBank size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.highlightTitle}>{strings.home.savingsLabel}</p>
                <p className={webStyles.highlightBody}>
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatAmount(balance.savings)} ${balance.currency}`} tucked away
                  across your savings accounts.
                </p>
                <Link href="/wallets" className={webStyles.highlightButton}>
                  {strings.home.seeWalletsButton}
                  <span className={webStyles.highlightButtonBadge}>
                    <ArrowUpRight size={12} strokeWidth={2.5} />
                  </span>
                </Link>
              </div>

              <div className={`${webStyles.highlightCard} ${webStyles.highlightBlue}`}>
                <span className={webStyles.highlightIcon}>
                  <Wallet size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.highlightTitle}>{strings.home.wallets}</p>
                <p className={webStyles.highlightBody}>
                  {wallets.length > 0
                    ? `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} holding your money right now.`
                    : strings.home.noWallets}
                </p>
                <Link href="/wallets" className={webStyles.highlightButton}>
                  {strings.home.seeWalletsButton}
                  <span className={webStyles.highlightButtonBadge}>
                    <ArrowUpRight size={12} strokeWidth={2.5} />
                  </span>
                </Link>
              </div>

              <div className={`${webStyles.highlightCard} ${webStyles.highlightRed} ${webStyles.highlightWide}`}>
                <span className={webStyles.highlightIcon}>
                  <Bell size={20} strokeWidth={2} />
                </span>
                <p className={webStyles.highlightTitle}>{strings.home.upcomingPayments}</p>
                <p className={webStyles.highlightBody}>
                  {upcomingPayments[0]
                    ? `${upcomingPayments[0].title} · ${formatAmount(upcomingPayments[0].amount)} ${balance.currency} due ${upcomingPayments[0].dueInLabel}`
                    : strings.home.noUpcomingPayments}
                </p>
                <Link href="/payments" className={webStyles.highlightButton}>
                  {upcomingPayments[0] ? 'Update' : strings.home.upcomingPayments}
                  <span className={webStyles.highlightButtonBadge}>
                    <ArrowUpRight size={12} strokeWidth={2.5} />
                  </span>
                </Link>
              </div>
            </div>

            <div className={`${webStyles.card} ${webStyles.areaBudget}`}>
              <div className={webStyles.cardHeader}>
                <h2 className={webStyles.cardTitle}>{strings.home.budgetSpentTitle}</h2>
                <span className={webStyles.budgetPercent}>{Math.min(999, budgetSpentPercent)}%</span>
              </div>
              <p className={webStyles.budgetAmountRow}>
                <span className={webStyles.budgetAmountSpent}>
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatAmount(monthExpenseTotal)} ${balance.currency}`}
                </span>
                <span className={webStyles.budgetAmountOf}>
                  {strings.home.budgetSpentOf}{' '}
                  {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatAmount(monthBudgeted)} ${balance.currency}`}
                </span>
              </p>
              <div className={webStyles.trackLight}>
                <div className={webStyles.fillLight} style={{ width: `${Math.min(100, budgetSpentPercent)}%` }} />
              </div>
            </div>

            {renderCashflowSection()}

            <div className={`${webStyles.card} ${webStyles.areaWallets}`}>
              <div className={webStyles.cardHeader}>
                <div className={webStyles.cardHeaderLeft}>
                  <span className={webStyles.cardIcon}>
                    <Wallet size={16} strokeWidth={2} />
                  </span>
                  <h2 className={webStyles.cardTitle}>{strings.home.wallets}</h2>
                </div>
                <Link href="/wallets" className={webStyles.textButton}>
                  {strings.home.seeWalletsButton}
                  <span className={webStyles.textButtonBadge}>
                    <ArrowUpRight size={12} strokeWidth={2.5} />
                  </span>
                </Link>
              </div>

              {wallets.length > 0 ? (
                <div className={webStyles.planList}>
                  {wallets.map((wallet) => (
                    <Link
                      key={wallet.id}
                      href={`/wallets/${wallet.id}`}
                      className={webStyles.planRow}
                      style={{ borderLeftColor: wallet.accentColor }}
                    >
                      <div className={webStyles.planRowTop}>
                        <span className={webStyles.planName}>{wallet.name}</span>
                        <span className={webStyles.planAmount}>
                          {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatCompact(wallet.amount)} ${wallet.currency}`}
                        </span>
                      </div>
                      {wallet.required > 0 && (
                        <>
                          <div className={webStyles.trackLight}>
                            <div
                              className={webStyles.fillLight}
                              style={{ width: `${Math.min(100, Math.round((wallet.amount / wallet.required) * 100))}%` }}
                            />
                          </div>
                          <span className={webStyles.planTarget}>
                            {strings.home.walletsRequired}: {formatCompact(wallet.required)} {wallet.currency}
                          </span>
                        </>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                !loading && <p className={styles.emptyText}>{strings.home.noWallets}</p>
              )}
            </div>

            <section className={`${styles.section} ${webStyles.areaTrans}`}>
              <div className={styles.sectionHeader}>
                <h2 className={`${styles.sectionTitle} ${webStyles.sectionTitleRich}`}>{strings.home.recentTransactionsTitle}</h2>
                <Link href="/transactions" className={styles.viewAllButton} aria-label="View all transactions">
                  <ArrowUpRight size={16} strokeWidth={2.25} />
                </Link>
              </div>

              {recentTransactions.length === 0 ? (
                !loading && <p className={styles.emptyText}>{strings.home.noRecentTransactions}</p>
              ) : (
                <table className={webStyles.table}>
                  <thead>
                    <tr>
                      <th>{strings.home.recentTransactionsTitle}</th>
                      <th>Account</th>
                      <th>Date</th>
                      <th className={webStyles.tableAmount}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((transaction) => {
                      const Icon = transaction.icon;
                      return (
                        <tr key={transaction.id} onClick={() => router.push(transaction.editHref)}>
                          <td>
                            <div className={webStyles.tableTitleCell}>
                              <span className={webStyles.tableDot} style={{ background: transactionDotColor(Icon) }} />
                              <span className={webStyles.tableIcon} style={{ background: transaction.iconColor }}>
                                <Icon size={16} strokeWidth={2} color={CATEGORY_ICON_COLOR} />
                              </span>
                              <div>
                                <p>{transaction.title}</p>
                                <p className={styles.emptyText}>{transaction.description}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={webStyles.accountPill}>{transaction.account}</span>
                          </td>
                          <td>{transaction.date}</td>
                          <td className={webStyles.tableAmount}>
                            {formatAmount(transaction.amount)} {transaction.currency}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <div className={webStyles.aside}>
              <div className={webStyles.card}>
                <div className={webStyles.cardHeader}>
                  <h2 className={webStyles.cardTitle}>{strings.home.statisticsTitle}</h2>
                </div>
                <div className={webStyles.statsTabs}>
                  <button
                    type="button"
                    className={`${webStyles.statsTab} ${statsMode === 'expense' ? webStyles.statsTabActive : ''}`}
                    onClick={() => setStatsMode('expense')}
                  >
                    {strings.home.statisticsExpenseTab}
                  </button>
                  <button
                    type="button"
                    className={`${webStyles.statsTab} ${statsMode === 'income' ? webStyles.statsTabActive : ''}`}
                    onClick={() => setStatsMode('income')}
                  >
                    {strings.home.statisticsIncomeTab}
                  </button>
                </div>
                {statsSegments.length > 0 ? (
                  <div className={webStyles.statsDonut}>
                    <DonutChart
                      segments={statsSegments}
                      size={140}
                      thickness={18}
                      legendPosition="bottom"
                      legendWrap
                      centerValue={balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : formatCompact(statsTotal)}
                      centerLabel={statsMode === 'expense' ? strings.home.monthExpensesLabel : strings.statistics.income}
                    />
                  </div>
                ) : (
                  !loading && <p className={styles.emptyText}>{strings.home.noCategoryData}</p>
                )}
              </div>

              <div className={webStyles.card}>{renderUpcomingPaymentsSection()}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page} ref={swipeRef}>
      <ScreenState loading={loading} error={error} />

      {renderBalanceCard()}

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>
            <PiggyBank size={16} strokeWidth={2} />
          </span>
          <span className={styles.summaryLabel}>{strings.home.savingsLabel}</span>
          <span className={styles.summaryValue}>
            {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatAmount(balance.savings)} ${balance.currency}`}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>
            <Wallet size={16} strokeWidth={2} />
          </span>
          <span className={styles.summaryLabel}>{strings.home.spendableLabel}</span>
          <span className={styles.summaryValue}>
            {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatAmount(balance.spendable)} ${balance.currency}`}
          </span>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{strings.home.quickActionsTitle}</h2>
        <div className={styles.quickActions}>
          {quickActions.map(({ label, icon: Icon, href }, index) => (
            <Link key={label} href={href} className={styles.quickAction}>
              <span
                className={styles.quickActionIcon}
                style={{ background: QUICK_ACTION_TINTS[index % QUICK_ACTION_TINTS.length] }}
              >
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
          <div className={styles.headerControls}>
            <Link href="/wallets" className={styles.viewAllButton} aria-label="View all wallets">
              <ArrowUpRight size={16} strokeWidth={2.25} />
            </Link>
          </div>
        </div>

        {wallets.length > 0 ? (
          <div className={styles.walletCardsRow} data-hscroll="true">
            {wallets.map((wallet) => (
              <Link
                key={wallet.id}
                href={`/wallets/${wallet.id}`}
                className={styles.walletCard}
                style={{ background: wallet.color }}
              >
                <div className={styles.walletCardTop}>
                  <p className={styles.walletCardType}>{wallet.type}</p>
                  <p className={styles.walletCardName}>{wallet.name}</p>
                </div>

                <div className={styles.walletCardNumberBlock}>
                  <p className={styles.walletCardLabel}>{strings.home.walletNumberLabel}</p>
                  <p className={styles.walletCardNumber}>{wallet.cardNumber}</p>
                </div>

                <div className={styles.walletCardBottomRow}>
                  <div className={styles.walletCardStat}>
                    <p className={styles.walletCardLabel}>{strings.home.walletsAvailable}</p>
                    <p className={styles.walletCardStatValue}>
                      {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : `${formatCompact(wallet.amount)} ${wallet.currency}`}
                    </p>
                  </div>
                  <div className={styles.walletCardStat}>
                    <p className={styles.walletCardLabel}>{strings.home.walletsRequired}</p>
                    <p className={styles.walletCardStatValue}>
                      {balancesHidden ? HIDDEN_AMOUNT_PLACEHOLDER : wallet.required > 0 ? formatCompact(wallet.required) : '*****'}
                    </p>
                  </div>
                </div>

                <div className={styles.walletCardLogoRow}>
                  <Logo height={14} variant="light" className={styles.walletCardLogo} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          !loading && <p className={styles.emptyText}>{strings.home.noWallets}</p>
        )}
      </section>

      {renderUpcomingPaymentsSection()}

      {renderCashflowSection()}

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
                <Link key={transaction.id} href={transaction.editHref} className={cardStyles.card}>
                  <span className={cardStyles.icon} style={{ background: transaction.iconColor }}>
                    <Icon size={20} strokeWidth={2} color={CATEGORY_ICON_COLOR} />
                  </span>
                  <div className={cardStyles.info}>
                    <p className={cardStyles.transactionTitle}>{transaction.title}</p>
                    <p className={cardStyles.description}>{transaction.description}</p>
                    <p className={cardStyles.account}>{transaction.account}</p>
                  </div>
                  <div className={cardStyles.amountRow}>
                    <span className={cardStyles.amount}>
                      {formatAmount(transaction.amount)} {transaction.currency}
                    </span>
                    <span className={cardStyles.date}>{transaction.date}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
