'use client';

// This month's budget notices for Home: the one-time migration review, the
// start-of-month banner, "Did it arrive?" for expected income whose date
// has passed, and the Ready to pay card — so they're seen on opening the
// app, not only on the Budget page.

import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import { ReadyToPayCard } from '@/src/widgets/ReadyToPay/ReadyToPayCard';
import { IncomePrompt, MigrationNotice, SetupBanner } from '@/src/phone/screens/BudgetMonth/Banners';

export function BudgetNotices() {
  const month = monthKeyOf(new Date());
  const data = useMonthBudget(month);
  const v = useBudgetMonth(month, data);
  if (data.loading) return null;
  return (
    <>
      {v.migrationPending && <MigrationNotice />}
      {v.banner && <SetupBanner text={v.banner} month={month} onDismiss={() => void v.dismissBanner()} />}
      {v.prompts.map((line) => (
        <IncomePrompt
          key={line.key}
          line={line}
          currency={v.currency}
          accounts={v.accounts}
          onRecord={(amount, accountId) => v.recordIncome(line, amount, accountId)}
          onNotYet={() => v.notYet(line)}
        />
      ))}
      <ReadyToPayCard />
    </>
  );
}
