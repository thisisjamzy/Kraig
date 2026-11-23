'use client';

// Edit transaction, drawn from Dreda.figcraft `Transactions / Web / Edit
// transaction` (panel `Form panel / Edit transaction`), the same panel as
// Add transaction (widgets/TransactionPanel):
//   type selector (Transfer disabled: an expense, income or saving can't
//   become a transfer here), the amount hero, Details (Description, From
//   wallet, Category, Budget item), When (Date), the impact, then Delete
//   (confirmed in a dialog) and Save changes in the footer.
// Time and Fees are not on this form: an edited transaction keeps its date
// only and has no charges of its own (useLogic edits neither).

import { CalendarDays, Clock, FileText, Tag, Target, Wallet } from 'lucide-react';
import { useLogic } from '@/src/logic/editTransaction/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { AmountHero, DateRow, DateTimeRows, TimeRow, ImpactCallout, InputRow, RowGroup, SelectRow, TxPanel, TypeSelector, type TxKind } from '@/src/widgets/TransactionPanel/TransactionPanel';

const KIND_OF = { Expense: 'expense', Income: 'income', Savings: 'savings' } as const;
const TYPE_OF = { expense: 'Expense', income: 'Income', savings: 'Savings' } as const;

export function EditTransactionScreen({ transactionId }: { transactionId: string }) {
  const strings = useStrings();
  const s = strings.editTransaction;
  const v = useLogic(transactionId);

  const ready = !v.loading && !v.error && !v.notFound;
  const shownAccounts = v.type === 'Expense' ? v.expenseAccounts : v.accounts;
  const account = shownAccounts.find((a) => a.id === v.accountId);
  const amount = Number(v.amountString) || 0;
  const day = v.dateValue ? new Date(`${v.dateValue}T00:00:00`) : null;
  const impact =
    amount > 0 && account
      ? `${v.type === 'Income' ? 'Records' : 'Takes'} ${Math.round(amount).toLocaleString('en-US')} ${v.type === 'Income' ? 'into' : 'from'} ${account.name}${
          day ? ` on ${day.getDate()} ${day.toLocaleDateString('en-GB', { month: 'short' })}` : ''
        }.`
      : null;
  const available = account ? Math.max(0, (account.currentBalance ?? 0) - (account.lockedAmount ?? 0)) : null;

  return (
    <TxPanel
      title={s.title}
      onClose={v.goBack}
      primary={ready ? { label: 'Save changes', disabled: !v.canSave, busy: v.submitting } : null}
      onSubmit={v.handleSave}
      onDelete={ready ? v.openDeleteConfirm : undefined}
      deleting={v.deleting}
      error={v.submitError ?? v.deleteError}
      overlays={
        v.deleteConfirmOpen ? (
          <ConfirmDialog
            title="Delete this transaction?"
            message={`${s.deleteHint}`}
            confirmLabel={v.deleting ? s.deleting : s.deleteConfirm}
            cancelLabel={s.deleteCancel}
            onConfirm={() => void v.confirmDelete()}
            onCancel={() => !v.deleting && v.cancelDelete()}
          />
        ) : null
      }
    >
      <ScreenState loading={v.loading} error={v.error} />
      {v.notFound && <p role="alert">{s.notFound}</p>}
      {ready && (
        <>
          <TypeSelector
            value={KIND_OF[v.type]}
            onChange={(k: TxKind) => k !== 'transfer' && v.setType(TYPE_OF[k])}
            disabled={{ transfer: 'A transfer moves money between two wallets. Delete this and add a transfer instead.' }}
          />
          <AmountHero
            value={v.amountString}
            onChange={v.setAmountString}
            currency={account?.currency ?? ''}
            helper={account && available !== null ? `${account.name} has ${Math.round(available).toLocaleString('en-US')} ${account.currency} available` : undefined}
          />
          <RowGroup label="Details">
            <InputRow icon={<FileText />} label={s.descriptionLabel} value={v.description} onChange={v.setDescription} placeholder="What was it for?" />
            {/* A Savings Account never funds a direct expense (useLogic's spendableAccounts). */}
            <SelectRow
              icon={<Wallet />}
              label={v.type === 'Income' ? 'Into wallet' : 'From wallet'}
              value={v.accountId}
              onChange={v.setAccountId}
              options={shownAccounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Choose a wallet"
            />
            <SelectRow
              icon={<Tag />}
              label={s.categoryLabel}
              value={v.categoryId}
              onChange={v.setCategoryId}
              options={v.categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={s.categoryPlaceholder}
            />
            {(v.bucketItemOptions.length > 0 || v.bucketItemKey) && (
              <SelectRow
                long
                icon={<Target />}
                label="Budget item"
                value={v.bucketItemKey}
                onChange={v.setBucketItemKey}
                options={v.bucketItemOptions.map((o) => ({ value: o.key, label: o.label }))}
                placeholder={s.bucketItemNone}
              />
            )}
          </RowGroup>
          <RowGroup label="When">
            <DateTimeRows>
              <DateRow icon={<CalendarDays />} label={s.dateLabel} value={v.dateValue} onChange={v.setDateValue} />
              <TimeRow icon={<Clock />} value={v.timeValue} onChange={v.setTimeValue} />
            </DateTimeRows>
          </RowGroup>
          {impact && <ImpactCallout>{impact}</ImpactCallout>}
        </>
      )}
    </TxPanel>
  );
}
