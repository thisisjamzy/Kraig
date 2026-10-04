'use client';

// Edit payment plan (src/logic/debtPlanEdit): the plan's cards from New
// debt, then "Apply to this and future payments" or "Only the next
// payment" when a plan already exists; the Impact card and the button.

import { SubmitButton, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useLogic } from '@/src/logic/debtPlanEdit/useLogic';
import { DebtFormFrame, FormError, ImpactCard, SegmentedCard } from './DebtFormParts';
import { PlanFieldsCards } from './PlanFieldsCards';
import { useFormExits, type DebtFormExits } from './useFormExits';

export function PlanFormScreen({ debtId, ...exits }: { debtId: string } & DebtFormExits) {
  const nav = useFormExits(debtId, exits);
  const v = useLogic(debtId, nav.saved);

  return (
    <DebtFormFrame title="payment plan" inPanel={nav.inPanel} onClose={nav.close}>
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && v.debt && (
        <form
          className={cf.cards}
          onSubmit={(e) => {
            e.preventDefault();
            void v.handleSave();
          }}
        >
          <PlanFieldsCards plan={v.plan} accounts={v.accounts} />
          {v.hadPlan && v.plan.hasPlan && (
            <SegmentedCard
              label="Apply to"
              value={v.scope}
              options={[
                { value: 'future', label: 'This and future payments', hint: 'The plan changes from the next payment on.' },
                { value: 'next', label: 'Only the next payment', hint: 'Only the next payment’s amount and date change.' },
              ]}
              onChange={v.setScope}
            />
          )}
          <ImpactCard lines={v.impact.lines} warnings={v.impact.warnings} />
          <SubmitButton disabled={!v.valid || v.saving}>{v.saving ? 'Saving…' : 'Save plan'}</SubmitButton>
          <FormError message={v.saveError} />
        </form>
      )}
    </DebtFormFrame>
  );
}
