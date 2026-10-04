'use client';

// New debt / Edit debt (src/logic/debtForm). The shared card form: Type
// (cash debt or record only, with a hint each), Name, Lender, Amount,
// Borrowed on | Received into, Priority, Payment plan, Notes, then the
// Impact card and the button.

import { useState } from 'react';
import { FieldCard, PickerCard, SubmitButton, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { DEBT_PRIORITIES, useLogic } from '@/src/logic/debtForm/useLogic';
import { AccountSheet, AmountCard, DateSheet, DebtFormFrame, FormError, ImpactCard, SegmentedCard, dayText } from './DebtFormParts';
import { PlanFieldsCards } from './PlanFieldsCards';
import { useFormExits, type DebtFormExits } from './useFormExits';

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

export const TYPE_OPTIONS = [
  { value: 'cash' as const, label: 'Cash debt', hint: 'The money came into one of my accounts.' },
  { value: 'existing' as const, label: 'Record only', hint: 'I owe this, but the money didn’t pass through my accounts.' },
];

type Sheet = 'lender' | 'date' | 'account' | null;

export function DebtFormScreen({ debtId, ...exits }: { debtId: string | null } & DebtFormExits) {
  const nav = useFormExits(debtId, exits);
  const v = useLogic(debtId, { onSaved: nav.saved, onSwitchType: (to) => debtId && nav.switchTo('wallet', debtId, { to }) });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [newLender, setNewLender] = useState('');

  return (
    <DebtFormFrame title={v.isEditing ? 'edit debt' : 'new debt'} inPanel={nav.inPanel} onClose={nav.close}>
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && (
        <form
          className={cf.cards}
          onSubmit={(e) => {
            e.preventDefault();
            void v.handleSave();
          }}
        >
          <SegmentedCard label="Type" value={v.debtType} options={TYPE_OPTIONS} onChange={v.chooseType} />

          <FieldCard label="Name">
            <input className={cf.valueInput} placeholder="Momokash loan" value={v.name} onChange={(e) => v.setName(e.target.value)} autoFocus={!v.isEditing} />
          </FieldCard>

          <PickerCard label="Lender" onClick={() => setSheet('lender')}>
            {v.lender || <span className={cf.muted}>Person or organisation</span>}
          </PickerCard>

          <AmountCard label="Amount" value={v.amount} onChange={v.setAmount} currency={v.currency} />

          <div className={v.isCash ? cf.row : undefined}>
            <PickerCard label="Borrowed on" onClick={() => setSheet('date')}>
              {dayText(v.borrowedOn)}
            </PickerCard>
            {v.isCash && (
              <PickerCard label="Received into" onClick={() => setSheet('account')} error={!v.accountId}>
                {v.accountName ?? 'Choose an account'}
              </PickerCard>
            )}
          </div>

          <SegmentedCard label="Priority" value={v.priority} options={DEBT_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} onChange={v.setPriority} />

          <PlanFieldsCards plan={v.plan} accounts={v.accounts} />

          <FieldCard label="Notes">
            <textarea className={cf.notesInput} rows={2} placeholder="Optional" value={v.notes} onChange={(e) => v.setNotes(e.target.value)} />
          </FieldCard>

          <ImpactCard lines={v.impact.lines} warnings={v.impact.warnings} error={v.impact.error} />

          <SubmitButton disabled={!v.valid || v.saving}>{v.saving ? 'Saving…' : v.isEditing ? 'Save changes' : 'Add debt'}</SubmitButton>
          <FormError message={v.saveError} />
        </form>
      )}

      {sheet === 'lender' && (
        <Modal title="Lender" onClose={() => setSheet(null)}>
          <div className={cf.sheetList}>
            {v.recentLenders.map((l) => (
              <button
                key={l}
                type="button"
                className={cf.sheetOption}
                aria-pressed={l === v.lender}
                onClick={() => {
                  v.setLender(l);
                  setSheet(null);
                }}
              >
                {l}
              </button>
            ))}
            <form
              className={cf.searchField}
              onSubmit={(e) => {
                e.preventDefault();
                if (!newLender.trim()) return;
                v.setLender(newLender.trim());
                setNewLender('');
                setSheet(null);
              }}
            >
              <span aria-hidden>+</span>
              <input placeholder="New lender" value={newLender} onChange={(e) => setNewLender(e.target.value)} aria-label="New lender" autoFocus={v.recentLenders.length === 0} />
            </form>
          </div>
        </Modal>
      )}
      {sheet === 'date' && <DateSheet title="Borrowed on" value={v.borrowedOn} onChange={v.setBorrowedOn} onClose={() => setSheet(null)} />}
      {sheet === 'account' && <AccountSheet title="Received into" accounts={v.accounts} value={v.accountId} onChange={v.setAccountId} onClose={() => setSheet(null)} />}
    </DebtFormFrame>
  );
}
