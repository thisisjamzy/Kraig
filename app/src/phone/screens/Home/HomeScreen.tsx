'use client';

// Money Home on a phone (owner, 24 Nov 2026), one column, 16px apart: the
// greeting header, the headline block (balance, then four figures two by
// two), quick actions, cash flow (scrolls sideways through 12 periods),
// spending, wallets, the budget, accountability, commitments and recent
// activity. The bottom bar is the layout's.
// The sections are widgets/MoneyHome, the same ones the web dashboard uses;
// data comes from src/logic/home.

import { Eye, EyeOff } from 'lucide-react';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { useLogic } from '@/src/logic/home/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { AccountabilityMini, Budget, CashFlow, Commitments, Headline, QuickActions, Recent, Spending, WalletsCard } from '@/src/widgets/MoneyHome/MoneyHome';
import { GreetingButton, GreetingHeader } from '@/src/phone/widgets/GreetingHeader/GreetingHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './PhoneHome.module.css';

export function HomeScreen() {
  const v = useLogic();
  const swipeRef = useSwipeModeSwitch('money');
  const [hidden, setHidden] = useAmountsHidden();

  return (
    <div ref={swipeRef} className={styles.page}>
      <GreetingHeader
        module="money"
        actions={
          <GreetingButton label={hidden ? 'Show amounts' : 'Hide amounts'} pressed={hidden} onClick={() => setHidden(!hidden)}>
            {hidden ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
          </GreetingButton>
        }
      />

      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && (
        <>
          <Headline v={v} />
          <QuickActions />
          <CashFlow v={v} phone />
          <Spending v={v} />
          <WalletsCard v={v} phone />
          <Budget v={v} max={5} />
          <AccountabilityMini v={v} phone />
          <Commitments v={v} phone />
          <Recent items={v.latest} />
        </>
      )}
    </div>
  );
}
