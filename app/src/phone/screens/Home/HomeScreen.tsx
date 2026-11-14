'use client';

// Money Home on a phone, drawn from Dreda.figcraft `Dashboard / Phone`: the
// greeting with the bell, the purple balance card, four quick actions, the
// wallet cards scrolling sideways, Money in and out, where the money went,
// this month's budget and recent activity. The bottom bar is the layout's.
// The sections are widgets/MoneyHome, the same ones the web dashboard uses;
// data comes from src/logic/home.

import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { useLogic } from '@/src/logic/home/useLogic';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { BalanceCard, Budget, MoneyInOut, QuickActions, Recent, Spending, Wallets } from '@/src/widgets/MoneyHome/MoneyHome';
import { NotificationBell } from '@/src/widgets/Notifications/NotificationBell';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './PhoneHome.module.css';

export function HomeScreen() {
  const v = useLogic();
  const { user } = useFirebaseUser();
  const swipeRef = useSwipeModeSwitch('money');
  const [hidden, setHidden] = useAmountsHidden();
  const name = user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const initials = name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
  const [part, first] = v.greeting.split(', ');

  return (
    <div ref={swipeRef} className={styles.page}>
      <header className={styles.header}>
        <Link href="/settings" className={styles.avatar} aria-label="Settings">
          {initials || '·'}
        </Link>
        <div className={styles.hello}>
          <span>{part}</span>
          <strong>{first ?? name}</strong>
        </div>
        <button type="button" className={styles.bell} aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} onClick={() => setHidden(!hidden)}>
          {hidden ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
        </button>
        <NotificationBell className={styles.bell} size={20} />
      </header>

      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && (
        <>
          <BalanceCard v={v} />
          <QuickActions />
          <Wallets v={v} />
          <MoneyInOut v={v} />
          <Spending v={v} variant="bar" />
          <Budget v={v} />
          <Recent items={v.latest} />
        </>
      )}
    </div>
  );
}
