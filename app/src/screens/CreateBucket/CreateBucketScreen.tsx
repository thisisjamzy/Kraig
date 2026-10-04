'use client';

// New basket, on the form standard (FormFrame): Name, Type, Kind, Currency |
// Target date (not for a Fixed basket, which repeats); More options:
// Description. Items are added from the basket's page afterwards.

import { useLogic } from '@/src/logic/createBucket/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FieldCard, FieldRow, FormFrame, MoreOptions, SegmentedField, SelectField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';

type BasketType = 'Expense' | 'Income' | 'Savings' | 'Transfer';

export function CreateBucketScreen() {
  const strings = useStrings();
  const v = useLogic();
  const t = strings.createBucket;
  const typeLabel: Record<BasketType, string> = { Expense: t.typeExpense, Income: t.typeIncome, Savings: t.typeSavings, Transfer: t.typeTransfer };
  const typeHint: Record<BasketType, string> = { Expense: t.typeExpenseHint, Income: t.typeIncomeHint, Savings: t.typeSavingsHint, Transfer: t.typeTransferHint };

  return (
    <FormFrame
      title="New basket"
      onClose={v.goBack}
      phoneHeader="bar"
      primary={v.loading ? null : { label: 'Add basket', disabled: !v.name.trim(), busy: v.saving }}
      onSubmit={v.handleSave}
      error={v.saveError}
    >
      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          <FieldCard label="Name">
            <input className={ff.input} value={v.name} onChange={(event) => v.setName(event.target.value)} placeholder={t.namePlaceholder} autoFocus />
          </FieldCard>
          <SegmentedField
            label={t.typeLabel}
            value={v.type}
            onChange={v.setType}
            options={(['Expense', 'Income', 'Savings', 'Transfer'] as BasketType[]).map((option) => ({ value: option, label: typeLabel[option] }))}
            hint={typeHint[v.type]}
          />
          <SegmentedField
            label={t.kindLabel}
            value={v.kind}
            onChange={(next) => {
              v.setKind(next);
              if (next === 'Fixed') v.setDeadline('');
            }}
            options={[
              { value: 'Variable', label: t.kindVariable },
              { value: 'Fixed', label: t.kindFixed },
            ]}
            hint={v.kind === 'Fixed' ? t.kindFixedHint : t.kindVariableHint}
          />
          <FieldRow>
            <SelectField label={t.currencyLabel} value={v.currency} onChange={v.setCurrency} options={v.currencyOptions.map((c) => ({ value: c.code, label: c.name }))} />
            {v.kind !== 'Fixed' ? (
              <FieldCard label={t.deadlineLabel}>
                <input type="date" className={ff.input} value={v.deadline} onChange={(event) => v.setDeadline(event.target.value)} />
              </FieldCard>
            ) : (
              <span />
            )}
          </FieldRow>
          <MoreOptions>
            <FieldCard label="Description">
              <textarea className={ff.input} rows={3} value={v.description} onChange={(event) => v.setDescription(event.target.value)} placeholder="What this basket is for" />
            </FieldCard>
          </MoreOptions>
          <p className={ff.hint}>{t.addLineItemsHint}</p>
        </>
      )}
    </FormFrame>
  );
}
