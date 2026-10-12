'use client';

// The time plan on a phone: a back-arrow header (it's a drill-down from
// Projects home's "Plan your time"), then the shared page (src/widgets/Planner), everything one
// card per row.

import { ArrowLeft } from 'lucide-react';
import { useTimePlan } from '@/src/logic/timePlan/useTimePlan';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { TimePlanPage } from '@/src/widgets/Planner/TimePlanPage';
import p from '@/src/widgets/Planner/Planner.module.css';

export function TimePlanScreen() {
  const logic = useTimePlan();
  const goBack = useGoBack();
  return (
    <>
      <ScreenHeader
        left={
          <button type="button" className={p.back} onClick={() => goBack('/projects')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Plan"
      />
      <TimePlanPage logic={logic} />
    </>
  );
}
