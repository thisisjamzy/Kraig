'use client';

// Plan a repayment (src/logic/debtSchedule): the debt (when opened from
// Payments), Date, Amount as "Set amount" or "Everything left", Paid from,
// Automation and Note; the Impact card and "Plan repayment". A side peek
// on wide screens, a full-screen page on a phone, like every debt form.

import { useState } from 'react';
import { FieldCard, PickerCard, SubmitButton, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useLogic } from '@/src/logic/debtSchedule/useLogic';
import { AUTOMATION_LABEL, AUTOMATION_MODES, useIncomeLines } from '@/src/logic/debtForm/planFields';
import { AccountSheet, DateSheet, DebtFormFrame, FormError, ImpactCard, SegmentedCard, dayText, fmt } from './DebtFormParts';
import { useFormExits, type DebtFormExits } from './useFormExits';
import styles from './DebtForms.module.css';

export function ScheduleFormScreen({ debtId, scheduledId = null, ...exits }: { debtId: string | null; scheduledId?: string | null } & DebtFormExits) {
  const nav = useFormExits(debtId, exits);
  const v = useLogic(debtId, scheduledId, nav.saved);
  const incomeLines = useIncomeLines();
  const [sheet, setSheet] = useState<'debt' | 'date' | 'from' | null>(null);

  return (
    <DebtFormFrame title={scheduledId ? 'Edit scheduled repayment' : 'Plan a repayment'} inPanel={nav.inPanel} onClose={nav.close}>
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && (
        <form
          className={cf.cards}
          onSubmit={(e) => {
            e.preventDefault();
            void v.handleSave();
          }}
        >
          {!debtId && (
            <PickerCard label="Debt" onClick={() => setSheet('debt')}>
              {v.debt ? v.debt.name : <span className={cf.muted}>Choose a debt</span>}
            </PickerCard>
          )}

          {v.debt && (
            <>
              <PickerCard label="Date" onClick={() => setSheet('date')}>
                {dayText(v.date)}
              </PickerCard>

              <SegmentedCard
                label="Amount"
                value={v.amountMode}
                options={[
                  { value: 'set', label: 'Set amount' },
                  { value: 'everything', label: 'Everything left', hint: 'What is left to repay on that date, after every earlier repayment. It updates when the balance changes.' },
                ]}
                onChange={v.setAmountMode}
              />
              {v.amountMode === 'set' ? (
                <FieldCard label={`Amount${v.currency ? ` (${v.currency})` : ''}`}>
                  <input
                    className={cf.valueInput}
                    inputMode="decimal"
                    placeholder="0"
                    value={v.amount}
                    onChange={(e) => v.setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                    aria-label="Repayment amount"
                  />
                </FieldCard>
              ) : (
                <FieldCard label="Everything left">
                  <span className={styles.currentFigure}>Currently {fmt(v.current)}</span>
                </FieldCard>
              )}

              <PickerCard label="Paid from" onClick={() => setSheet('from')}>
                {v.fromName ?? <span className={cf.muted}>Choose</span>}
              </PickerCard>

              <SegmentedCard
                label="Automation"
                value={v.automation}
                options={AUTOMATION_MODES.map((m) => ({
                  value: m,
                  label: AUTOMATION_LABEL[m],
                  hint: m === 'off' ? 'You record it yourself.' : m === 'remind' ? 'A reminder on the day.' : 'It waits in Ready to pay for one tap to confirm.',
                }))}
                onChange={v.setAutomation}
              />

              <FieldCard label="Note">
                <textarea className={cf.notesInput} rows={2} placeholder="Optional" value={v.note} onChange={(e) => v.setNote(e.target.value)} />
              </FieldCard>

              <ImpactCard
                lines={v.recordOnly ? [...v.impact.lines, 'Tracked on the debt only: nothing pays it from your accounts, so it adds no budget line.'] : v.impact.lines}
                warnings={v.impact.warnings}
              />
              {v.impact.tooMuch && (
                <button type="button" className={styles.inlineAction} onClick={v.useEverythingLeft}>
                  Use everything left
                </button>
              )}

              <SubmitButton disabled={!v.valid || v.saving}>{v.saving ? 'Saving…' : scheduledId ? 'Save repayment' : 'Plan repayment'}</SubmitButton>
              {v.editing && (
                <button type="button" className={styles.inlineAction} data-tone="danger" disabled={v.saving} onClick={() => void v.handleDelete()}>
                  Remove this repayment
                </button>
              )}
              <FormError message={v.saveError} />
            </>
          )}
        </form>
      )}

      {sheet === 'debt' && (
        <Modal title="Debt" onClose={() => setSheet(null)}>
          <div className={cf.sheetList}>
            {v.debts.map((d) => (
              <button
                key={d.id}
                type="button"
                className={cf.sheetOption}
                aria-pressed={d.id === v.debtId}
                onClick={() => {
                  v.setDebtId(d.id);
                  setSheet(null);
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {sheet === 'date' && <DateSheet title="Date" value={v.date} onChange={v.setDate} onClose={() => setSheet(null)} />}
      {sheet === 'from' && (
        <AccountSheet
          title="Paid from"
          accounts={v.accounts.map((a) => ({ ...a, id: `account:${a.id}` }))}
          value={v.paidFrom}
          onChange={v.setPaidFrom}
          onClose={() => setSheet(null)}
          extra={[
            { id: 'anyIncome', label: 'Any income', hint: 'From whichever income arrives first' },
            ...incomeLines.map((l) => ({ id: `income:${l.bucketId}:${l.itemId}`, label: l.name, hint: 'When this income arrives' })),
            { id: 'savings', label: 'Savings', hint: 'From money set aside' },
          ]}
        />
      )}
    </DebtFormFrame>
  );
}
