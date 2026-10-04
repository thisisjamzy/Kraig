'use client';

// The payment plan's cards: "No plan" / "Repeating"; then Amount | Every,
// First payment | Paid from, and Automation. Shared by New debt / Edit
// debt and Edit payment plan.

import { useState } from 'react';
import { FieldCard, PickerCard, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { Modal } from '@/src/widgets/Modal/Modal';
import { AUTOMATION_LABEL, AUTOMATION_MODES, PLAN_INTERVALS, paidFromLabel, useIncomeLines, type PlanFields } from '@/src/logic/debtForm/planFields';
import { INTERVAL_LABEL } from '@/src/viewmodels/debt';
import { AccountSheet, DateSheet, SegmentedCard, dayText, type AccountOption } from './DebtFormParts';

type Sheet = 'every' | 'first' | 'from' | null;

export function PlanFieldsCards({ plan, accounts, showToggle = true }: { plan: PlanFields; accounts: AccountOption[]; showToggle?: boolean }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const incomeLines = useIncomeLines();
  const fromLabel = paidFromLabel(plan.paidFrom, accounts, incomeLines);

  return (
    <>
      {showToggle && (
        <SegmentedCard
          label="Payment plan"
          value={plan.hasPlan ? 'repeating' : 'none'}
          options={[
            { value: 'none', label: 'No plan' },
            { value: 'repeating', label: 'Repeating' },
          ]}
          onChange={(v) => plan.setHasPlan(v === 'repeating')}
        />
      )}
      {plan.hasPlan && (
        <>
          <div className={cf.row}>
            <FieldCard label="Amount">
              <input
                className={cf.valueInput}
                inputMode="decimal"
                placeholder="0"
                value={plan.amount}
                onChange={(e) => plan.setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                aria-label="Plan amount"
              />
            </FieldCard>
            <PickerCard label="Every" onClick={() => setSheet('every')}>
              {INTERVAL_LABEL[plan.interval]}
            </PickerCard>
          </div>
          <div className={cf.row}>
            <PickerCard label="First payment" onClick={() => setSheet('first')}>
              {dayText(plan.firstPayment)}
            </PickerCard>
            <PickerCard label="Paid from" onClick={() => setSheet('from')}>
              {fromLabel ?? <span className={cf.muted}>Choose</span>}
            </PickerCard>
          </div>
          <SegmentedCard
            label="Automation"
            value={plan.automation}
            options={AUTOMATION_MODES.map((m) => ({
              value: m,
              label: AUTOMATION_LABEL[m],
              hint:
                m === 'off'
                  ? 'You record each payment yourself.'
                  : m === 'remind'
                    ? 'A reminder on the day a payment is due.'
                    : 'The payment waits in Ready to pay for one tap to confirm.',
            }))}
            onChange={plan.setAutomation}
          />
        </>
      )}

      {sheet === 'every' && (
        <Modal title="Every" onClose={() => setSheet(null)}>
          <div className={cf.sheetList}>
            {PLAN_INTERVALS.map((i) => (
              <button
                key={i}
                type="button"
                className={cf.sheetOption}
                aria-pressed={i === plan.interval}
                onClick={() => {
                  plan.setInterval(i);
                  setSheet(null);
                }}
              >
                {INTERVAL_LABEL[i]}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {sheet === 'first' && <DateSheet title="First payment" value={plan.firstPayment} onChange={plan.setFirstPayment} onClose={() => setSheet(null)} />}
      {sheet === 'from' && (
        <AccountSheet
          title="Paid from"
          accounts={accounts.map((a) => ({ ...a, id: `account:${a.id}` }))}
          value={plan.paidFrom}
          onChange={plan.setPaidFrom}
          onClose={() => setSheet(null)}
          extra={[
            { id: 'anyIncome', label: 'Any income', hint: 'From whichever income arrives first' },
            ...incomeLines.map((l) => ({ id: `income:${l.bucketId}:${l.itemId}`, label: l.name, hint: 'When this income arrives' })),
            { id: 'savings', label: 'Savings', hint: 'From money set aside' },
          ]}
        />
      )}
    </>
  );
}
