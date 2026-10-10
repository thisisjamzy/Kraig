'use client';

// Add transaction (and Record income), on the form standard (FormFrame): one
// page instead of the old four steps and keypad.
//   Type; the savings mode or the income type when it applies
//   Amount | Date
//   Basket, then Item (never fills in the amount; a Payment offers its
//   full due amount as a chip), Category (this month's budgeted ones,
//   or every one when recording unplanned)
//   Account, or From | To with Charges for a transfer
//   Description
//   More options: "explains the unaccounted-for balance" for a past date
// then the Impact card and "Add expense" (income, transfer, savings).

import Link from 'next/link';
import { useLogic, formatMoney, type TransactionType } from '@/src/logic/addTransaction/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import {
  FieldCard,
  FieldRow,
  FormFrame,
  ListSelectField,
  MoreOptions,
  SegmentedField,
  SelectField,
  SwitchField,
  formFrameStyles as ff,
} from '@/src/widgets/FormFrame/FormFrame';
import type { IncomeSubtype } from '@/src/shared/budget/flow';

const TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'savings'];
const INCOME_SUBTYPES: { value: IncomeSubtype; label: string }[] = [
  { value: 'earned', label: 'Earned' },
  { value: 'other', label: 'Other' },
  { value: 'debt_financing', label: 'Borrowed' },
];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function AddTransactionScreen() {
  const strings = useStrings();
  const t = strings.addTransaction;
  const v = useLogic();
  const accountOptions = (v.type === 'expense' ? v.spendableAccounts : v.accounts).map((a) => ({ value: a.id, label: a.name }));
  const amount = Number(v.amountString) || 0;
  const day = v.dateValue ? new Date(`${v.dateValue}T00:00:00`) : null;
  const when = day ? ` on ${day.getDate()} ${SHORT[day.getMonth()]}` : '';
  const what = v.categoryName ? ` for ${v.categoryName}` : '';
  const impact =
    amount > 0 && v.fromAccount
      ? v.isTransferLike
        ? v.toAccount
          ? `Moves ${formatMoney(v.amountString)} from ${v.fromAccount} to ${v.toAccount}${when}.`
          : null
        : v.type === 'income'
          ? `Adds ${formatMoney(v.amountString)} to ${v.fromAccount}${when}${what}.`
          : `Takes ${formatMoney(v.amountString)} from ${v.fromAccount}${when}${what}.`
      : null;
  // A basket item says what the money does to it: "Hangouts will have 12,000 left."
  const impactText = [impact, v.itemImpact].filter(Boolean).join(' ') || null;
  const showCategory = v.categoriesForType.length > 0 || !v.hasBudgetedCategories;

  return (
    <FormFrame
      title={t.title}
      onClose={v.close}
      phoneHeader="bar"
      impact={impactText}
      primary={v.loading ? null : { label: `Add ${t.types[v.type].label.toLowerCase()}`, disabled: !v.canSave, busy: v.submitting, busyLabel: t.saving }}
      onSubmit={() => void v.handleConfirm()}
      error={v.submitError}
    >
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && (
        <>
          <SegmentedField label="Type" value={v.type} onChange={v.selectType} options={TYPES.map((key) => ({ value: key, label: t.types[key].label }))} />
          {v.type === 'savings' && (
            <SegmentedField
              label="Savings"
              value={v.savingsMode}
              onChange={v.chooseSavingsMode}
              options={[
                { value: 'moved', label: 'Move to savings' },
                { value: 'frozen', label: 'Freeze in wallet' },
              ]}
            />
          )}
          {v.type === 'income' && <SegmentedField label="Income type" value={v.incomeSubtype} onChange={v.setIncomeSubtype} options={INCOME_SUBTYPES} />}

          <FieldRow>
            <FieldCard label="Amount">
              <input className={ff.input} inputMode="decimal" value={v.amountString} onChange={(e) => v.setAmount(e.target.value)} placeholder="0" autoFocus />
            </FieldCard>
            <FieldCard label="Date">
              <input type="date" className={ff.input} value={v.dateValue} onChange={(e) => e.target.value && v.chooseDate(e.target.value)} />
            </FieldCard>
          </FieldRow>

          {(v.basketOptions.length > 0 || v.linkedBucketItem) && (
            <>
              <ListSelectField
                label="Basket"
                value={v.basketChoice}
                onChange={v.chooseBasket}
                options={[...v.basketOptions, { value: 'unsure', label: 'Not sure yet' }]}
                placeholder="Choose a basket"
              />
              {v.basketChoice && v.basketChoice !== 'unsure' && (
                <ListSelectField
                  label="Item"
                  value={v.linkedBucketItem?.id ?? ''}
                  onChange={(id) => (id ? v.selectLinkedBucketItem(id) : v.clearLinkedBucketItem())}
                  options={v.itemOptions}
                  placeholder="Choose an item"
                />
              )}
              {v.itemHelper && <p className={ff.hint}>{v.itemHelper}</p>}
              {v.payFull !== null && Number(v.amountString) !== v.payFull && (
                <button type="button" className={ff.chip} onClick={v.usePayFull}>
                  Pay the full {formatMoney(String(v.payFull))} due
                </button>
              )}
            </>
          )}

          {showCategory && !v.linkedBucketItem && (
            <>
              {v.categoriesForType.length > 0 && (
                <SelectField
                  label={v.isTransferLike ? 'Transfer type' : 'Category'}
                  value={v.category}
                  onChange={v.setCategory}
                  options={v.categoriesForType.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Choose one"
                />
              )}
              {v.hasBudgetedCategories ? (
                <SwitchField
                  label={t.recordUnplannedCta}
                  description={v.recordingUnplanned ? t.unplannedNotice : t.unplannedOffHint}
                  checked={v.recordingUnplanned}
                  onChange={v.setShowUnplanned}
                />
              ) : (
                <p className={ff.hint}>
                  {t.noBudgetTitle} {t.noBudgetBody} <Link href={v.budgetHref}>{t.addBudgetCta}</Link>
                </p>
              )}
            </>
          )}

          {v.isTransferLike ? (
            <>
              <FieldRow>
                <SelectField label={t.fromAccount} value={v.fromAccountId} onChange={v.setFromAccountId} options={accountOptions} placeholder={t.chooseAccount} />
                <SelectField
                  label={t.toAccount}
                  value={v.toAccountId}
                  onChange={v.setToAccountId}
                  options={v.accounts.filter((a) => a.id !== v.fromAccountId).map((a) => ({ value: a.id, label: a.name }))}
                  placeholder={t.chooseAccount}
                />
              </FieldRow>
              <FieldCard label={t.chargesLabel}>
                <input className={ff.input} inputMode="decimal" value={v.chargesString} onChange={(e) => v.setChargesString(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
                <span className={ff.hint}>{t.chargesHint}</span>
              </FieldCard>
            </>
          ) : (
            <SelectField
              label={v.type === 'income' ? t.incomeAccount : t.expenseAccount}
              value={v.fromAccountId}
              onChange={v.setFromAccountId}
              options={accountOptions}
              placeholder={t.chooseAccount}
            />
          )}

          <FieldCard label={t.descriptionLabel}>
            <input className={ff.input} value={v.description} onChange={(e) => v.setDescription(e.target.value)} placeholder={t.descriptionPlaceholder} />
          </FieldCard>

          {v.canExplainUnjustifiedBalance && (
            <MoreOptions defaultOpen>
              <SwitchField
                label={t.explainUnjustifiedLabel}
                description={`${t.explainUnjustifiedHint} ${formatMoney(String(Math.abs(v.unjustifiedBalance)))}`}
                checked={v.explainsUnjustifiedBalance}
                onChange={v.setExplainsUnjustifiedBalance}
              />
            </MoreOptions>
          )}
        </>
      )}
    </FormFrame>
  );
}
