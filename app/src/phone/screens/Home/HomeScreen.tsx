'use client';

// Money Home on a phone, drawn from Dreda.figcraft `Dashboard / Phone`: the
// greeting with the bell, the purple balance card, four quick actions, the
// wallet cards scrolling sideways, Money in and out, where the money went,
// this month's budget and recent activity. The bottom bar is the layout's.
// The sections are widgets/MoneyHome, the same ones the web dashboard uses;
// data comes from src/logic/home.

import { Eye, EyeOff } from 'lucide-react';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { useLogic } from '@/src/logic/home/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { BalanceCard, Budget, MoneyInOut, QuickActions, Recent, Spending, Wallets } from '@/src/widgets/MoneyHome/MoneyHome';
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
