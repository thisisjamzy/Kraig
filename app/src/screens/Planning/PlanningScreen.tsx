'use client';

// /budget — the Budget page for the month in the URL (?month=YYYY-MM), on
// every screen size. Payments and Transactions are pages of their own now;
// older links to this page's tabs (?tab=payments, ?tab=history) go there.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLogic, type PlanningTab } from '@/src/logic/planning/useLogic';
import { BudgetMonthPage } from '@/src/screens/BudgetMonth/BudgetMonthPage';

export function PlanningScreen({ defaultTab = 'budget' }: { defaultTab?: PlanningTab }) {
  const router = useRouter();
  const { tab, month, setMonth, bucketFilter, categoryFilter, data } = useLogic(defaultTab);

  useEffect(() => {
    if (tab === 'budget') return;
    const params = new URLSearchParams({ month });
    if (bucketFilter) params.set('bucket', bucketFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    router.replace(`${tab === 'payments' ? '/payments' : '/transactions'}?${params.toString()}`);
  }, [tab, month, bucketFilter, categoryFilter, router]);

  if (tab !== 'budget') return null;
  return <BudgetMonthPage month={month} data={data} onMonth={setMonth} />;
}
