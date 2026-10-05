'use client';

// Record repayment (src/logic/debtRepay): Amount, Date, Paid from (an
// account for a cash debt; a toggle, then an account, for record only),
// Method (Planned or Manual) and Note; the Impact card and the button.

import { useState } from 'react';
import { FieldCard, PickerCard, SubmitButton, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useLogic } from '@/src/logic/debtRepay/useLogic';
import { AccountSheet, AmountCard, DateSheet, DebtFormFrame, FormError, ImpactCard, SegmentedCard, ToggleCard, dayText, fmt } from './DebtFormParts';
import { useFormExits, type DebtFormExits } from './useFormExits';

export function RepaymentFormScreen({
  debtId,
  prefillAmount = null,
  scheduledId = null,
  ...exits
}: { debtId: string; prefillAmount?: string | null; scheduledId?: string | null } & DebtFormExits) {
  const nav = useFormExits(debtId, exits);
  const v = useLogic(debtId, prefillAmount, nav.saved, scheduledId);
  const [sheet, setSheet] = useState<'date' | 'account' | null>(null);

  return (
    <DebtFormFrame title="record repayment" inPanel={nav.inPanel} onClose={nav.close}>
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && v.debt && (
        <form
          className={cf.cards}
          onSubmit={(e) => {
            e.preventDefault();
            void v.handleSave();
          }}
        >
          <AmountCard label={`Amount to ${v.debt.lender || v.debt.name}`} value={v.amount} onChange={v.setAmount} currency={v.currency} autoFocus />

          <PickerCard label="Date" onClick={() => setSheet('date')}>
            {dayText(v.date)}
          </PickerCard>

          {!v.isCash && <ToggleCard label="Paid from one of my accounts" checked={v.fromAccount} onChange={v.setFromAccount} />}
          {v.useAccount && (
            <PickerCard label="Paid from" onClick={() => setSheet('account')} error={Boolean(v.fundsError) || !v.accountId}>
              {v.account ? `${v.account.name} · ${fmt(v.account.currentBalance ?? 0)}` : 'Choose an account'}
            </PickerCard>
          )}

          <SegmentedCard
            label="Method"
            value={v.method}
            options={[
              { value: 'planned', label: 'Planned', hint: 'A payment from the plan.' },
              { value: 'manual', label: 'Manual', hint: 'An extra or one-off payment.' },
            ]}
            onChange={v.setMethod}
          />

          <FieldCard label="Note">
            <textarea className={cf.notesInput} rows={2} placeholder="Optional" value={v.note} onChange={(e) => v.setNote(e.target.value)} />
          </FieldCard>

          <ImpactCard lines={v.impact.lines} warnings={v.impact.warnings} error={v.fundsError} />

          <SubmitButton disabled={!v.valid || v.saving}>{v.saving ? 'Saving…' : 'Record repayment'}</SubmitButton>
          <FormError message={v.saveError} />
        </form>
      )}
      {sheet === 'date' && <DateSheet title="Date" value={v.date} onChange={v.setDate} onClose={() => setSheet(null)} />}
      {sheet === 'account' && <AccountSheet title="Paid from" accounts={v.accounts} value={v.accountId} onChange={v.setAccountId} onClose={() => setSheet(null)} />}
    </DebtFormFrame>
  );
}
