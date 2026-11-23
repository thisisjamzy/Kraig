'use client';

// Money Home on tablet and web (Dreda.figcraft `Dashboard / Web`). The header
// carries the greeting and the month; then, 24px apart, the overview (balance
// card and four tiles), the wallets, cash flow and spending, income and the
// budget, recent activity and upcoming bills. The sections live in
// widgets/MoneyHome (shared with the phone); data comes from src/logic/home.

import { AccountabilityTile } from '@/src/widgets/Accountability/AccountabilityCard';
import { CalendarDays } from 'lucide-react';
import { useLogic } from '@/src/logic/home/useLogic';
import { useBreadcrumb } from '@/src/widgets/AppShell/breadcrumb';
import { TopBarControls, TopBarTitle } from '@/src/widgets/AppShell/TopBarSlot';
import { BalanceCard, Bills, Budget, CashFlow, Income, Kpis, Recent, Spending, Wallets } from '@/src/widgets/MoneyHome/MoneyHome';
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
          <section className={styles.overview} aria-label="Overview">
            <BalanceCard v={v} />
            <Kpis v={v} />
          </section>
          <Wallets v={v} />
          <AccountabilityTile rows={v.accountability} />
          <div className={styles.rowInsights}>
            <CashFlow v={v} />
            <Spending v={v} />
          </div>
          <div className={styles.rowHalves}>
            <Income v={v} />
            <Budget v={v} />
          </div>
          <div className={styles.rowActivity}>
            <Recent items={v.latest} />
            <Bills v={v} />
          </div>
        </>
      )}
    </div>
  );
}
