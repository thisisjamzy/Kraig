'use client';

// Add transaction (and Record income), drawn from Dreda.figcraft
// `Transactions / Web / Add transaction`, the same panel as Edit
// transaction (widgets/TransactionPanel), top to bottom:
//   the type selector (Expense, Income, Transfer, Savings);
//   the amount hero ("How much?", the wallet's available money);
//   Details: the wallet (From and To for a transfer), the savings mode or
//     income type when it applies, Basket then Budget item (a Payment
//     offers its full due amount as a chip), Category (a picker with a
//     search, this month's planned ones first, then the rest, and Add
//     category; picking an unplanned one records it as unplanned);
//   When: Date;
//   More: Note, Fees (transfers), "This explains part of my unaccounted
//     balance" for a past date;
// then the impact and "Save expense" (income, transfer, savings).
// There is no Time row: a transaction is recorded on a date (useLogic).

import { useState } from 'react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Modal } from '@/src/widgets/Modal/Modal';
import { TemplatePicker } from '@/src/widgets/TemplatePicker/TemplatePicker';
import tp from '@/src/widgets/TemplatePicker/TemplateForm.module.css';
import Link from 'next/link';
import { CalendarDays, Clock, FileText, FolderPlus, PiggyBank, Receipt, ShoppingBasket, Tag, Target, Wallet } from 'lucide-react';
import { useLogic, formatMoney, type TransactionType } from '@/src/logic/addTransaction/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { CategoryRow } from '@/src/widgets/CategoryPicker/CategoryPicker';
import {
  AmountHero,
  DateRow,
  ImpactCallout,
  InputRow,
  DateTimeRows,
  TimeRow,
  RowChip,
  RowGroup,
  RowNote,
  SelectRow,
  ToggleRow,
  TxPanel,
  TypeSelector,
} from '@/src/widgets/TransactionPanel/TransactionPanel';
import type { IncomeSubtype } from '@/src/shared/budget/flow';

const INCOME_SUBTYPES: { value: IncomeSubtype; label: string }[] = [
  { value: 'earned', label: 'Earned' },
  { value: 'other', label: 'Other' },
  { value: 'debt_financing', label: 'Borrowed' },
];
const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthWord = (iso: string) => MONTH_WORDS[Number(iso.slice(5, 7)) - 1] ?? '';
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function AddTransactionScreen() {
  const strings = useStrings();
  const t = strings.addTransaction;
  const v = useLogic();
  const walletList = v.type === 'expense' ? v.expenseAccounts : v.type === 'transfer' ? v.transferFromAccounts : v.accounts;
  const accountOptions = walletList.map((a) => ({ value: a.id, label: a.name }));
  const wallet = v.accounts.find((a) => a.id === v.fromAccountId);
  const available = wallet ? Math.max(0, (wallet.currentBalance ?? 0) - (wallet.lockedAmount ?? 0)) : null;
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
  const showBasket = v.basketOptions.length > 0 || Boolean(v.linkedBucketItem) || v.canCreateBasket;
  const { isWide } = useLayout();
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState(false);
  const walletName = (id: string | null) => (id ? (v.transferFromAccounts.find((a) => a.id === id)?.name ?? null) : null);

  return (
    <TxPanel
      title="New transaction"
      onClose={v.close}
      onTemplates={() => setPicking(true)}
      overlays={
        <>
          {picking && (
            <TemplatePicker
              templates={v.templates}
              walletName={walletName}
              onClose={() => setPicking(false)}
              onPick={(tpl) => {
                v.applyTemplate(tpl);
                setPicking(false);
              }}
            />
          )}
          {naming !== null && (
            <Modal title="Save as template" onClose={() => setNaming(null)}>
              <form
                className={tp.nameForm}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await v.saveAsTemplate(naming)) {
                    setNaming(null);
                    setSavedTemplate(true);
                  }
                }}
              >
                <label>
                  Name
                  <input value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Daily transport" autoFocus />
                </label>
                <button type="submit" disabled={!naming.trim()}>
                  Save template
                </button>
              </form>
            </Modal>
          )}
        </>
      }
      primary={v.loading ? null : { label: `Save ${t.types[v.type].label.toLowerCase()}`, disabled: !v.canSave, busy: v.submitting, busyLabel: t.saving }}
      onSubmit={() => v.handleConfirm()}
      error={v.submitError}
    >
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && (
        <>
          {!isWide && (
            <button type="button" className={tp.useTemplate} onClick={() => setPicking(true)}>
              <FileText size={18} strokeWidth={2} aria-hidden />
              Use a template
            </button>
          )}
          <TypeSelector value={v.type} onChange={(k) => v.selectType(k as TransactionType)} />

          <AmountHero
            value={v.amountString}
            onChange={v.setAmount}
            currency={wallet?.currency ?? ''}
            autoFocus
            helper={wallet && available !== null ? `${wallet.name} has ${Math.round(available).toLocaleString('en-US')} ${wallet.currency} available` : undefined}
          />

          <RowGroup label="Details">
            {v.isTransferLike ? (
              <>
                <SelectRow icon={<Wallet />} label={t.fromAccount} value={v.fromAccountId} onChange={v.setFromAccountId} options={accountOptions} placeholder={t.chooseAccount} />
                <SelectRow
                  icon={<Wallet />}
                  label={t.toAccount}
                  value={v.toAccountId}
                  onChange={v.setToAccountId}
                  options={v.accounts.filter((a) => a.id !== v.fromAccountId).map((a) => ({ value: a.id, label: a.name }))}
                  placeholder={t.chooseAccount}
                />
              </>
            ) : (
              <SelectRow
                icon={<Wallet />}
                label={v.type === 'income' ? 'Into wallet' : 'From wallet'}
                value={v.fromAccountId}
                onChange={v.setFromAccountId}
                options={accountOptions}
                placeholder={t.chooseAccount}
              />
            )}
            {v.type === 'savings' && (
              <SelectRow
                icon={<PiggyBank />}
                label="Savings"
                value={v.savingsMode}
                onChange={(m) => m && v.chooseSavingsMode(m as typeof v.savingsMode)}
                options={[
                  { value: 'moved', label: 'Move to savings' },
                  { value: 'frozen', label: 'Freeze in wallet' },
                ]}
              />
            )}
            {v.type === 'income' && (
              <SelectRow icon={<Tag />} label="Income type" value={v.incomeSubtype} onChange={(x) => x && v.setIncomeSubtype(x as IncomeSubtype)} options={INCOME_SUBTYPES} />
            )}
            {showBasket && (
              <SelectRow
                long
                icon={<ShoppingBasket />}
                label="Basket"
                value={v.basketChoice}
                onChange={v.chooseBasket}
                options={[...v.basketOptions, ...(v.canCreateBasket ? [{ value: 'new', label: '+ New basket' }] : []), { value: 'unsure', label: 'Not sure yet' }]}
                placeholder="Choose a basket"
              />
            )}
            {showBasket && v.basketChoice && v.basketChoice !== 'unsure' && v.basketChoice !== 'new' && (
              <SelectRow
                long
                icon={<Target />}
                label="Budget item"
                value={v.linkedBucketItem?.id ?? ''}
                onChange={(id) => (id ? v.selectLinkedBucketItem(id) : v.clearLinkedBucketItem())}
                options={v.itemOptions}
                placeholder="Choose an item"
              />
            )}
            {showCategory && !v.linkedBucketItem && !v.isTransferLike && (
              <CategoryRow
                icon={<Tag />}
                label="Category"
                value={v.category}
                onChange={v.pickCategory}
                categories={v.allCategories}
                planned={v.plannedCategoryIds}
                kind={v.categoryKind}
              />
            )}
            {showCategory && !v.linkedBucketItem && v.isTransferLike && v.categoriesForType.length > 0 && (
              <SelectRow
                icon={<Tag />}
                label={v.isTransferLike ? 'Transfer type' : 'Category'}
                value={v.category}
                onChange={v.setCategory}
                options={v.categoriesForType.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Choose one"
              />
            )}
            {showCategory && !v.linkedBucketItem && v.hasBudgetedCategories && (
              <ToggleRow
                label={t.recordUnplannedCta}
                description={v.recordingUnplanned ? t.unplannedNotice : t.unplannedOffHint}
                checked={v.recordingUnplanned}
                onChange={v.setShowUnplanned}
              />
            )}
          </RowGroup>
          {v.itemHelper && <RowNote>{v.itemHelper}</RowNote>}
          {v.payFull !== null && Number(v.amountString) !== v.payFull && <RowChip onClick={v.usePayFull}>Pay the full {formatMoney(String(v.payFull))} due</RowChip>}
          {showCategory && !v.linkedBucketItem && !v.hasBudgetedCategories && (
            <RowNote>
              {t.noBudgetTitle} {t.noBudgetBody} <Link href={v.budgetHref}>{t.addBudgetCta}</Link>
            </RowNote>
          )}

          {v.basketChoice === 'new' && (
            <>
              <RowGroup label="New basket">
                <InputRow icon={<FolderPlus />} label="New basket name" value={v.newBasketName} onChange={v.setNewBasketName} placeholder="Car repairs" />
                {v.isTransferLike ? (
                  v.newBasketCategories.length > 0 && (
                    <SelectRow
                      icon={<Tag />}
                      label="Transfer type"
                      value={v.newBasketCategory}
                      onChange={v.setNewBasketCategory}
                      options={v.newBasketCategories.map((c) => ({ value: c.id, label: c.name }))}
                      placeholder="Choose one"
                    />
                  )
                ) : (
                  <CategoryRow icon={<Tag />} label="Category" value={v.newBasketCategory} onChange={v.setNewBasketCategory} categories={v.newBasketCategories} kind={v.categoryKind} />
                )}
              </RowGroup>
              <RowNote>
                {Number(v.amountString) > 0
                  ? `Adds this ${formatMoney(v.amountString)} as the basket's first item, on this date, then links it.`
                  : "Enter the amount first. It becomes the basket's first item."}
              </RowNote>
              {v.newBasketError && <RowNote tone="error">{v.newBasketError}</RowNote>}
              <RowChip onClick={v.createBasketHere} disabled={!v.newBasketReady}>
                {v.creatingBasket || v.linkingNewBasket ? 'Creating basket…' : 'Create basket'}
              </RowChip>
            </>
          )}

          <RowGroup label="When">
            <DateTimeRows>
              <DateRow icon={<CalendarDays />} label="Date" value={v.dateValue} onChange={v.chooseDate} />
              <TimeRow icon={<Clock />} value={v.timeValue} onChange={v.setTimeValue} />
            </DateTimeRows>
          </RowGroup>

          <RowGroup label="More">
            <InputRow icon={<FileText />} label="Note" value={v.description} onChange={v.setDescription} placeholder={t.descriptionPlaceholder} />
            {v.isTransferLike && (
              <InputRow
                icon={<Receipt />}
                label="Fees (MoMo or bank charges)"
                value={v.chargesString}
                onChange={(x) => v.setChargesString(x.replace(/[^0-9.]/g, ''))}
                placeholder="None"
                inputMode="decimal"
                note={v.feeFromSchedule ? 'From your fee schedule' : null}
              />
            )}
            {/* A past entry can come out of the money reconciliations found
                missing ("unaccounted for"): suggested when it's dated before a
                check done in its own month. */}
            {v.canExplainUnjustifiedBalance && (
              <ToggleRow
                label={v.type === 'income' ? t.explainUnjustifiedIncomeLabel : t.explainUnjustifiedLabel}
                description={
                  v.monthUnaccounted.checks > 0
                    ? `${monthWord(v.dateValue)}: ${formatMoney(String(v.monthUnaccounted.unaccounted))} still unaccounted for after ${v.monthUnaccounted.checks} ${v.monthUnaccounted.checks === 1 ? 'check' : 'checks'}. ${t.explainUnjustifiedHint} ${formatMoney(String(Math.abs(v.unjustifiedBalance)))}.`
                    : `${t.explainUnjustifiedHint} ${formatMoney(String(Math.abs(v.unjustifiedBalance)))}.`
                }
                checked={v.explainsUnjustifiedBalance}
                onChange={v.setExplainsUnjustifiedBalance}
              />
            )}
          </RowGroup>

          {impactText && <ImpactCallout>{impactText}</ImpactCallout>}
          <button
            type="button"
            className={tp.saveAs}
            disabled={!v.category && !v.amountString}
            onClick={() => {
              setSavedTemplate(false);
              setNaming(v.description || v.categoryName || '');
            }}
          >
            {savedTemplate ? 'Saved as a template' : 'Save as template'}
          </button>
        </>
      )}
    </TxPanel>
  );
}
