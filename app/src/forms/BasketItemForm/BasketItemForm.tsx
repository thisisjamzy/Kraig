'use client';

// New and edit basket item, on the form standard (FormFrame): a full-screen
// page on a phone, a side peek (or its own page) on wide screens. The
// basket page's logic (src/logic/bucketDetail) owns the fields and the
// save; this file only lays them out, in this order:
//   1. Name
//   2. Amount
//   3. Category | Need
//   4. Priority
//   5. Repeats | Due day
//   6. Paid from (an account, any income, one income line, or savings)
//   7. More options: Description, Automation, Not before | Needed by,
//      Splittable, Shopping list
// then the Impact card and "Add basket item".
// A transfer basket's item moves money between two accounts instead: From |
// To in place of Paid from, and Amount | Charges.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { useLogic, CUSTOM_FREQUENCIES, type ItemRepeat } from '@/src/logic/bucketDetail/useLogic';
import { NECESSITY_LABEL, NECESSITY_OPTIONS, PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import {
  FieldCard,
  FieldRow,
  FormFrame,
  MoreOptions,
  SegmentedField,
  SelectField,
  SwitchField,
  formFrameStyles as ff,
  useFormExits,
} from '@/src/widgets/FormFrame/FormFrame';
import type { Frequency, ItemAutomation } from '@/src/shared/firestore/types';
import styles from './BasketItemForm.module.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n: number) => Math.round(n).toLocaleString('en-US');

function ordinal(n: number) {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${tail}`;
}

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${ordinal(i + 1)} of the month` }));
const REPEAT_OPTIONS: { value: ItemRepeat; label: string }[] = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Custom', label: 'Custom' },
];
const UNIT: Record<Frequency, [string, string]> = {
  Once: ['time', 'times'],
  Daily: ['day', 'days'],
  Weekly: ['week', 'weeks'],
  Monthly: ['month', 'months'],
  Quarterly: ['quarter', 'quarters'],
  Yearly: ['year', 'years'],
};
const AUTOMATION_OPTIONS: { value: ItemAutomation['mode']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'remind', label: 'Remind me' },
  { value: 'prepare', label: 'Prepare it' },
];

function isoOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function BasketItemForm({ goalId, itemId }: { goalId: string; itemId?: string }) {
  const router = useRouter();
  const v = useLogic(goalId);
  const basketHref = `/baskets/${goalId}`;
  const exits = useFormExits({ close: () => router.replace(basketHref) });

  // Seed the form once the item (if any) has loaded: during render, the
  // first time it can, then never again for this item.
  const seedKey = itemId ?? 'new';
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seeded = seededFor === seedKey;
  if (!seeded && !v.loading) {
    const item = itemId ? v.lineItems.find((entry) => entry.id === itemId) : null;
    if (!itemId || item) {
      if (item) v.openEditItem(item);
      else v.openAdd();
      setSeededFor(seedKey);
    }
  }

  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');

  const editing = Boolean(itemId);
  const fixed = v.isFixedBucket;
  const transfer = v.isTransferBucket;
  const currency = v.bucket?.currency ?? '';
  const amount = Number(v.itemAmount) || 0;
  const accounts = v.accountOptionsForCategory(v.itemCategoryId);
  const monthly = v.itemRepeat === 'Monthly';
  const dueDay = v.itemDueDate ? new Date(`${v.itemDueDate}T00:00:00`).getDate() : null;

  function setDueDay(day: string) {
    if (!day) return v.setItemDueDate('');
    const now = new Date();
    v.setItemDueDate(isoOf(new Date(now.getFullYear(), now.getMonth(), Number(day))));
  }

  // Impact: what saving does to the plan, in one sentence.
  const first = v.itemDueDate ? new Date(`${v.itemDueDate}T00:00:00`) : new Date();
  const monthName = MONTHS[first.getMonth()];
  const when =
    v.itemRepeat === 'none'
      ? v.itemDueDate
        ? `due ${first.getDate()} ${SHORT[first.getMonth()]}`
        : `for ${monthName}`
      : v.itemRepeat === 'Monthly'
        ? `for ${monthName} and every month after`
        : v.itemRepeat === 'Weekly'
          ? `every week from ${first.getDate()} ${SHORT[first.getMonth()]}`
          : `every ${v.itemInterval > 1 ? `${v.itemInterval} ` : ''}${UNIT[v.itemCustomFrequency][v.itemInterval > 1 ? 1 : 0]} from ${monthName}`;
  const basketName = v.bucket?.name ?? 'this basket';
  const impact =
    amount > 0
      ? editing
        ? `Sets ${v.itemName.trim() || 'this item'} to ${money(amount)} in ${basketName} ${when}.`
        : `Adds ${money(amount)} to ${basketName} ${when}.`
      : null;

  const paidFromGroups = [
    { label: 'Accounts', options: accounts.filter((a) => !v.savingsAccounts.some((s) => s.id === a.id)).map((a) => ({ value: `account:${a.id}`, label: a.name })) },
    { label: 'Savings', options: accounts.filter((a) => v.savingsAccounts.some((s) => s.id === a.id)).map((a) => ({ value: `account:${a.id}`, label: a.name })) },
    { label: 'Income', options: [{ value: 'any_income', label: 'Any income' }, ...v.incomeLineOptions.map((l) => ({ value: `income:${l.id}`, label: `When ${l.name} arrives` }))] },
  ];

  const consumed = v.itemSubItems.filter((s) => s.completed).reduce((sum, s) => sum + s.amount, 0);

  return (
    <FormFrame
      title={editing ? 'Edit basket item' : 'New basket item'}
      context={v.bucket ? `In ${v.bucket.name}` : undefined}
      onClose={exits.close}
      phoneHeader="watermark"
      impact={impact}
      primary={seeded ? { label: editing ? 'Save basket item' : 'Add basket item', disabled: !v.canSaveLineItem, busy: v.savingItem } : null}
      onSubmit={() => void v.handleAddLineItem(exits.inPeek ? exits.done : undefined)}
      error={v.itemError}
    >
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && seeded && (
        <>
          <FieldCard label="Name">
            <input className={ff.input} value={v.itemName} onChange={(e) => v.setItemName(e.target.value)} placeholder="School fees" autoFocus={!editing} />
          </FieldCard>

          {transfer ? (
            <FieldRow>
              <FieldCard label={`Amount${currency ? ` (${currency})` : ''}`}>
                <input className={ff.input} inputMode="decimal" value={v.itemAmount} onChange={(e) => v.setItemAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
              </FieldCard>
              <FieldCard label="Charges">
                <input className={ff.input} inputMode="decimal" value={v.itemCharges} onChange={(e) => v.setItemCharges(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
              </FieldCard>
            </FieldRow>
          ) : (
            <FieldCard label={`Amount${currency ? ` (${currency})` : ''}`}>
              <input className={ff.input} inputMode="decimal" value={v.itemAmount} onChange={(e) => v.setItemAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
            </FieldCard>
          )}

          {v.hasNeed ? (
            <FieldRow>
              <SelectField
                label="Category"
                value={v.itemCategoryId}
                onChange={v.setItemCategoryId}
                options={v.categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Choose a category"
              />
              <SegmentedField
                label="Need"
                value={v.itemNecessity}
                onChange={v.setItemNecessity}
                options={NECESSITY_OPTIONS.map((n) => ({ value: n, label: NECESSITY_LABEL[n] }))}
              />
            </FieldRow>
          ) : (
            <SelectField
              label={transfer ? 'Transfer type' : 'Category'}
              value={v.itemCategoryId}
              onChange={v.setItemCategoryId}
              options={v.categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Choose one"
            />
          )}

          {v.hasNeed && (
            <SegmentedField label="Priority" value={v.itemPriority} onChange={v.setItemPriority} options={PRIORITY_LEVELS.map((p) => ({ value: p, label: p }))} />
          )}

          <FieldRow>
            <SelectField
              label="Repeats"
              value={v.itemRepeat}
              onChange={(next) => v.setItemRepeat(next as ItemRepeat)}
              options={REPEAT_OPTIONS.filter((o) => !fixed || o.value !== 'none')}
            />
            {monthly ? (
              <SelectField label="Due day" value={dueDay ? String(dueDay) : ''} onChange={setDueDay} options={DAY_OPTIONS} placeholder={fixed ? 'Choose a day' : 'No due day'} />
            ) : (
              <FieldCard label="Due date">
                <input type="date" className={ff.input} value={v.itemDueDate} onChange={(e) => v.setItemDueDate(e.target.value)} />
              </FieldCard>
            )}
          </FieldRow>

          {v.itemRepeat === 'Custom' && (
            <FieldRow>
              <FieldCard label="Every">
                <input
                  className={ff.input}
                  inputMode="numeric"
                  value={String(v.itemInterval)}
                  onChange={(e) => v.setItemInterval(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))}
                />
              </FieldCard>
              <SelectField
                label="Unit"
                value={v.itemCustomFrequency}
                onChange={(next) => v.setItemCustomFrequency(next as Frequency)}
                options={CUSTOM_FREQUENCIES.map((f) => ({ value: f, label: UNIT[f][v.itemInterval > 1 ? 1 : 0] }))}
              />
            </FieldRow>
          )}

          {transfer ? (
            <FieldRow>
              <SelectField label="From" value={v.itemAccountId} onChange={v.setItemAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Choose" />
              <SelectField
                label="To"
                value={v.itemToAccountId}
                onChange={v.setItemToAccountId}
                options={accounts.filter((a) => a.id !== v.itemAccountId).map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Choose"
              />
            </FieldRow>
          ) : (
            <SelectField label="Paid from" value={v.itemPaidFrom} onChange={v.setItemPaidFrom} groups={paidFromGroups} placeholder="Not set" />
          )}

          <MoreOptions defaultOpen={editing && Boolean(v.itemDescription || v.itemNotBefore || v.itemNeededBy || v.itemSplittable || v.itemSubItems.length)}>
            <FieldCard label="Description">
              <textarea className={ff.input} rows={3} value={v.itemDescription} onChange={(e) => v.setItemDescription(e.target.value)} placeholder="Notes for this item" />
            </FieldCard>
            {!transfer && (
              <SegmentedField
                label="Automation"
                value={v.itemAutomationMode}
                onChange={v.setItemAutomationMode}
                options={AUTOMATION_OPTIONS}
                hint={
                  v.itemAutomationMode === 'prepare'
                    ? 'Added to Ready to pay when it is due or its income arrives.'
                    : v.itemAutomationMode === 'remind'
                      ? 'A notification when it is due.'
                      : undefined
                }
              />
            )}
            <FieldRow>
              <FieldCard label="Not before">
                <input type="date" className={ff.input} value={v.itemNotBefore} onChange={(e) => v.setItemNotBefore(e.target.value)} />
              </FieldCard>
              <FieldCard label="Needed by">
                <input type="date" className={ff.input} value={v.itemNeededBy} onChange={(e) => v.setItemNeededBy(e.target.value)} />
              </FieldCard>
            </FieldRow>
            <SwitchField label="Splittable" description="Can be paid in several parts." checked={v.itemSplittable} onChange={v.setItemSplittable} />
            <div className={styles.list}>
              <span className={styles.listHead}>
                <span>Shopping list</span>
                {v.itemSubItems.length > 0 && (
                  <span>
                    {money(consumed)} of {money(amount)}
                  </span>
                )}
              </span>
              {v.itemSubItems.map((sub) => (
                <span key={sub.id} className={styles.subRow}>
                  <input type="checkbox" checked={sub.completed} onChange={() => v.toggleSubItemDraft(sub.id)} aria-label={`${sub.name} bought`} />
                  <span className={styles.subName} data-done={sub.completed || undefined}>
                    {sub.name}
                  </span>
                  <span className={styles.subAmount}>{money(sub.amount)}</span>
                  <button type="button" className={styles.subRemove} onClick={() => v.removeSubItem(sub.id)} aria-label={`Remove ${sub.name}`}>
                    <X size={14} strokeWidth={2.25} />
                  </button>
                </span>
              ))}
              <span className={styles.subAdd}>
                <input className={styles.subInput} value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Item" />
                <input className={styles.subInput} data-amount inputMode="decimal" value={subAmount} onChange={(e) => setSubAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Amount" />
                <button
                  type="button"
                  className={styles.subAddButton}
                  disabled={!subName.trim() || !(Number(subAmount) > 0)}
                  onClick={() => {
                    v.addSubItem(subName, Number(subAmount));
                    setSubName('');
                    setSubAmount('');
                  }}
                  aria-label="Add to the shopping list"
                >
                  <Plus size={16} strokeWidth={2.25} />
                </button>
              </span>
            </div>
          </MoreOptions>
        </>
      )}
    </FormFrame>
  );
}
