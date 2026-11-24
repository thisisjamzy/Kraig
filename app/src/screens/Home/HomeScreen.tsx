'use client';

// Money Home on tablet and web (owner, 24 Nov 2026). The header carries the
// greeting and the month; then, 24px apart: the headline strip (balance,
// money in, money out, transfers, saved), cash flow full width, a grid of
// Budget (tall, both rows), Spending, Accountability, Commitments and
// Wallets, then recent activity. The sections live in widgets/MoneyHome
// (shared with the phone); data comes from src/logic/home.

import { CalendarDays } from 'lucide-react';
import { useLogic } from '@/src/logic/home/useLogic';
import { useBreadcrumb } from '@/src/widgets/AppShell/breadcrumb';
import { TopBarControls, TopBarTitle } from '@/src/widgets/AppShell/TopBarSlot';
import { AccountabilityMini, Budget, CashFlow, Commitments, Headline, Recent, Spending, WalletsCard } from '@/src/widgets/MoneyHome/MoneyHome';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from '@/src/widgets/MoneyHome/MoneyHome.module.css';

const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

export function HomeScreen() {
  const v = useLogic();
  useBreadcrumb([{ label: 'Money', href: '/home' }, { label: 'Dashboard', href: '/home' }]);

  return (
    <div className={styles.page}>
      <TopBarTitle>
        <div>
          <h1>{v.greeting}</h1>
          <p>Here is where your money stands today.</p>
        </div>
      </TopBarTitle>
      <TopBarControls>
        <span className={styles.monthPill}>
          <CalendarDays size={18} strokeWidth={2} aria-hidden />
          {MONTH_YEAR.format(v.now)}
        </span>
      </TopBarControls>

      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && (
        <>
          <Headline v={v} />
          <CashFlow v={v} />
          <div className={styles.grid3}>
            <div className={styles.gBudget}>
              <Budget v={v} />
            </div>
            <div className={styles.gSpending}>
              <Spending v={v} />
            </div>
            <div className={styles.gAccount}>
              <AccountabilityMini v={v} />
            </div>
            <div className={styles.gCommit}>
              <Commitments v={v} />
            </div>
            <div className={styles.gWallets}>
              <WalletsCard v={v} />
            </div>
          </div>
          <Recent items={v.latest} />
        </>
      )}
    </div>
  );
}
