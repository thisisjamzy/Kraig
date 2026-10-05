'use client';

// New basket and Edit basket on the form standard (src/logic/createBucket):
// a side peek on tablet and web, the BASELINE full-screen form on a phone.
// "New basket" (24px, no icon) with "Money · October 2026" under it; field
// cards in order: Name; Type; Kind (Expenses only); Category; Starts |
// Repeats; Default paid from (not for income); Target amount | Target date
// (savings only); More options: Description, Currency, Automation default.
// Impact, then "Create basket" and the text button "Create and add items".
// No corner checkmark.

import { useLogic, BASKET_TYPES, BASKET_TYPE_LABEL } from '@/src/logic/createBucket/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FieldCard, FieldRow, FormFrame, ImpactCard, MoreOptions, SegmentedField, SelectField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
import styles from './BasketForm.module.css';

export function BasketForm({ basketId = null }: { basketId?: string | null }) {
  const v = useLogic(basketId);

  return (
    <FormFrame
      title={v.editing ? 'Edit basket' : 'New basket'}
      context={v.context}
      onClose={v.goBack}
      phoneHeader="bar"
      impact={
        <ImpactCard>
          <p>{v.impact}</p>
        </ImpactCard>
      }
      primary={v.loading ? null : { label: v.editing ? 'Save basket' : 'Create basket', disabled: !v.canSave, busy: v.saving }}
      onSubmit={() => void v.save()}
      error={v.saveError}
      after={
        !v.editing && !v.loading ? (
          <button type="button" className={styles.secondary} disabled={!v.canSave || v.saving} onClick={() => void v.save(true)}>
            Create and add items
          </button>
        ) : null
      }
    >
      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          {v.managed && <p className={ff.hint}>Dreda keeps this basket up to date from your debts.</p>}
          <FieldCard label="Name">
            <input className={ff.input} value={v.name} onChange={(e) => v.setName(e.target.value)} placeholder="e.g. Emergency fund" autoFocus={!v.editing} />
          </FieldCard>

          <SegmentedField
            label="Type"
            value={v.type}
            onChange={v.setType}
            options={BASKET_TYPES.map((t) => ({ value: t, label: BASKET_TYPE_LABEL[t] }))}
            hint={v.typeLocked ? 'The type can change only while the basket has no items.' : undefined}
          />

          {v.showKind && (
            <SegmentedField
              label="Kind"
              value={v.kind}
              onChange={v.setKind}
              options={[
                { value: 'Fixed', label: 'Fixed' },
                { value: 'Variable', label: 'Variable' },
              ]}
              hint={v.kind === 'Fixed' ? 'Set bills: rent, school fees, subscriptions.' : 'A limit used through the month: food, transport.'}
            />
          )}

          {v.type !== 'Transfer' && (
            <SelectField label="Category" value={v.categoryId} onChange={v.setCategoryId} options={v.categoryOptions} placeholder="Choose a category" />
          )}

          <FieldRow>
            <SelectField label="Starts" value={v.startMonth} onChange={v.setStartMonth} options={v.monthOptions} />
            <SelectField
              label="Repeats"
              value={v.repeats}
              onChange={(next) => v.setRepeats(next as 'monthly' | 'once')}
              options={[
                { value: 'monthly', label: 'Every month' },
                { value: 'once', label: 'This month only' },
              ]}
            />
          </FieldRow>

          {v.showPaidFrom && <SelectField label="Default paid from" value={v.paidFrom} onChange={v.setPaidFrom} groups={v.paidFromGroups} placeholder="Choose" />}

          {v.type === 'Savings' && (
            <FieldRow>
              <FieldCard label={`Target amount (${v.currency})`}>
                <input className={ff.input} inputMode="decimal" value={v.targetAmount} onChange={(e) => v.setTargetAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
              </FieldCard>
              <FieldCard label="Target date">
                <input type="date" className={ff.input} value={v.deadline} onChange={(e) => v.setDeadline(e.target.value)} />
              </FieldCard>
            </FieldRow>
          )}

          <MoreOptions>
            <FieldCard label="Description">
              <textarea className={ff.input} rows={3} value={v.description} onChange={(e) => v.setDescription(e.target.value)} placeholder="What this basket is for" />
            </FieldCard>
            <SelectField label="Currency" value={v.currency} onChange={v.setCurrency} options={v.currencyOptions.map((c) => ({ value: c.code, label: c.name }))} />
            <SelectField
              label="Automation default for its items"
              value={v.automation}
              onChange={(next) => v.setAutomation(next as 'off' | 'remind' | 'prepare')}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'remind', label: 'Remind me' },
                { value: 'prepare', label: 'Prepare for confirmation' },
              ]}
            />
          </MoreOptions>
        </>
      )}
    </FormFrame>
  );
}
