'use client';

// The money plan on a phone: a back-arrow header (it's a drill-down from
// Baskets), then the shared page (src/widgets/Planner), everything one
// card per row.

import { ArrowLeft } from 'lucide-react';
import { useMoneyPlan } from '@/src/logic/moneyPlan/useMoneyPlan';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { MoneyPlanPage } from '@/src/widgets/Planner/MoneyPlanPage';
import p from '@/src/widgets/Planner/Planner.module.css';

export function MoneyPlanScreen() {
  const logic = useMoneyPlan();
  const goBack = useGoBack();
  return (
    <>
      <ScreenHeader
        left={
          <button type="button" className={p.back} onClick={() => goBack('/baskets')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Plan"
      />
      <MoneyPlanPage logic={logic} />
    </>
  );
}
