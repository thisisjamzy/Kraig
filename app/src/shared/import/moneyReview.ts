// The Money template's review: Wallets, Income sources, Baskets and Basket
// items read, checked and matched against what exists, by name only
// (names.ts). A wallet or income source matches by name, a basket by name
// and type, an item by name inside its basket. Names a row points to
// (a basket, a wallet) are linked to what exists or to another row; only
// names found in neither are created. Income sources are the items of an
// Income basket (the app's model): the first one, or a new "Income".
// Pure; tested in test/importTemplates.test.ts.

import type { BucketItemNecessity, IncomeSubtype, Priority } from '../firestore/types';
import { nameKey } from './names';
import { cellText, parseDate } from './projectTasks';
import { MONEY_OPTIONS } from './templates';
import { amount, byName, cell, diff, oneOf, settle, skippedRow, yesNo, type Mapping, type ReviewItem, type Row } from './review';
import type { SheetRows } from './timeReview';

export type BasketType = 'Expense' | 'Income' | 'Savings' | 'Transfer';

export interface WalletValues {
  name: string;
  /** The app's own account type (ACCOUNT_TYPES). */
  type: string;
  opening: number;
  usable: boolean | null;
}
export interface IncomeValues {
  name: string;
  amount: number;
  day: number | null;
  frequency: 'Monthly' | 'Weekly' | 'Once';
  subtype: IncomeSubtype;
  wallet: string;
  basket: string;
}
export interface BasketValues {
  name: string;
  type: BasketType;
  kind: 'Fixed' | 'Variable';
  category: string;
  categoryId: string | null;
  startMonth: string;
  repeats: 'monthly' | 'once';
  paidFrom: string;
}
export interface BasketItemValues {
  basket: string;
  name: string;
  amount: number;
  necessity: BucketItemNecessity;
  priority: Priority;
  frequency: 'Monthly' | 'Weekly' | null;
  /** A day of the month, or a date (yyyy-MM-dd). */
  dueDay: number | null;
  dueDate: string | null;
  paidFrom: string;
  automation: 'off' | 'remind' | 'prepare';
  notBefore: string | null;
  neededBy: string | null;
  splittable: boolean;
}

export type MoneyItem = ReviewItem<WalletValues | IncomeValues | BasketValues | BasketItemValues>;

export interface MoneyExisting {
  wallets: { id: string; name: string; type: string; archived: boolean; usableForPlan?: boolean }[];
  baskets: { id: string; name: string; type: BasketType; kind: 'Fixed' | 'Variable'; archived: boolean; categoryId: string | null; defaultPaidFrom: string | null }[];
  items: { id: string; basketId: string; name: string; amount: number; priority: string; necessity: string; dueDay: number | null; accountId: string | null; frequency: string | null }[];
  categories: { id: string; name: string; type: string }[];
}

export interface MoneyInput {
  wallets?: SheetRows | null;
  income?: SheetRows | null;
  baskets?: SheetRows | null;
  items?: SheetRows | null;
  existing: MoneyExisting;
  dayFirst?: boolean;
  /** yyyy-MM: the month a basket starts when Starts is empty. */
  thisMonth: string;
}

const WALLET_TYPE: Record<string, string> = {
  'mobile money': 'Mobile Money',
  momo: 'Mobile Money',
  bank: 'Current Account',
  'current account': 'Current Account',
  card: 'Debit Card',
  'debit card': 'Debit Card',
  cash: 'Cash',
  savings: 'Savings Account',
  'savings account': 'Savings Account',
  'e wallet': 'E-wallet',
  'e-wallet': 'E-wallet',
};
const BASKET_TYPE: Record<string, BasketType> = { income: 'Income', expenses: 'Expense', expense: 'Expense', savings: 'Savings', saving: 'Savings', transfers: 'Transfer', transfer: 'Transfer' };
export const BASKET_TYPE_WORD: Record<BasketType, string> = { Expense: 'Expenses', Income: 'Income', Savings: 'Savings', Transfer: 'Transfers' };
const SUBTYPE: Record<string, IncomeSubtype> = { earned: 'earned', other: 'other', 'debt financing': 'debt_financing' };
const AUTOMATION: Record<string, BasketItemValues['automation']> = { off: 'off', 'remind me': 'remind', remind: 'remind', 'prepare for confirmation': 'prepare', prepare: 'prepare' };

const money = (n: number) => n.toLocaleString('en-US');

export function buildMoneyReview(input: MoneyInput): MoneyItem[] {
  const { existing, dayFirst = true, thisMonth } = input;
  const items: MoneyItem[] = [];
  const base = (kind: MoneyItem['kind'], sheet: string, rowNumber: number | null, name: string, group: string): MoneyItem => ({
    key: rowNumber === null ? `${kind}:implied:${nameKey(group)}|${nameKey(name)}` : `${kind}:${sheet}:${rowNumber}`,
    kind,
    sheet,
    rowNumber,
    name,
    group,
    values: {} as WalletValues,
    text: '',
    status: 'new',
    problems: [],
    notes: [],
    match: null,
    changes: [],
    decision: 'create',
    decided: true,
    canCreateAnyway: kind === 'basketItem' || kind === 'income',
  });

  // ---- Wallets ----
  const exWallets = byName(existing.wallets);
  const fileWallets = new Map<string, MoneyItem>();
  const usesRows = (s: SheetRows | null | undefined, fn: (row: Row, m: Mapping, rowNumber: number, sheet: string) => void) =>
    s?.rows.forEach((row, i) => {
      if (!skippedRow(row, s.mapping)) fn(row, s.mapping, i + 2, s.sheet);
    });
  usesRows(input.wallets, (row, m, n, sheet) => {
    const name = cellText(cell(row, m, 'name'));
    const item = base('wallet', sheet, n, name, 'Wallets');
    const p = item.problems;
    const typeText = nameKey(cell(row, m, 'type'));
    const type = typeText ? WALLET_TYPE[typeText] : 'Cash';
    if (!type) p.push(`Type must be ${MONEY_OPTIONS.walletTypes.join(', ')}, not "${cellText(cell(row, m, 'type'))}"`);
    const v: WalletValues = { name, type: type ?? 'Cash', opening: amount(cell(row, m, 'opening'), 'Opening balance', p) ?? 0, usable: yesNo(cell(row, m, 'usable'), 'Usable for the plan', p) };
    if (v.usable !== null && v.type !== 'Savings Account') item.notes.push('Usable for the plan only applies to savings wallets');
    item.values = v;
    item.text = `${v.type}, opening balance ${money(v.opening)}`;
    if (!name) p.push('Name is empty');
    else if (fileWallets.has(nameKey(name))) sameFile(item, fileWallets.get(nameKey(name))!);
    else {
      fileWallets.set(nameKey(name), item);
      const hit = exWallets.get(nameKey(name));
      if (hit) {
        dup(item, hit.id, hit.name, hit.archived);
        if (typeText) diff(item.changes, 'Type', hit.type, v.type);
        if (v.usable !== null) diff(item.changes, 'Usable for the plan', hit.usableForPlan ?? false, v.usable);
      }
    }
    items.push(item);
  });
  const resolveWallet = (name: string, sheet: string) => {
    const k = nameKey(name);
    if (!k || fileWallets.has(k)) return;
    const item = base('wallet', sheet, null, name, 'Wallets');
    item.values = { name, type: 'Cash', opening: 0, usable: null } as WalletValues;
    const hit = exWallets.get(k);
    if (hit) linked(item, hit.id, hit.name, hit.archived);
    else item.text = 'Cash, opening balance 0';
    fileWallets.set(k, item);
    items.push(item);
  };

  // ---- Baskets (name and type) ----
  const fileBaskets = new Map<string, MoneyItem>(); // name key -> the first basket of that name
  const fileBasketsTyped = new Map<string, MoneyItem>(); // type|name
  const exBasket = (name: string, type?: BasketType) =>
    existing.baskets.find((b) => nameKey(b.name) === nameKey(name) && (!type || b.type === type) && !b.archived) ??
    existing.baskets.find((b) => nameKey(b.name) === nameKey(name) && (!type || b.type === type));
  const categoryOf = (name: string, type: BasketType) =>
    existing.categories.find((c) => nameKey(c.name) === nameKey(name) && c.type === type) ?? existing.categories.find((c) => nameKey(c.name) === nameKey(name));
  usesRows(input.baskets, (row, m, n, sheet) => {
    const name = cellText(cell(row, m, 'name'));
    const item = base('basket', sheet, n, name, 'Baskets');
    const p = item.problems;
    const typeText = nameKey(cell(row, m, 'type'));
    const type = typeText ? BASKET_TYPE[typeText] : 'Expense';
    if (!type) p.push(`Type must be Income, Expenses, Savings or Transfers, not "${cellText(cell(row, m, 'type'))}"`);
    const kind = oneOf(cell(row, m, 'kind'), MONEY_OPTIONS.basketKinds, 'Kind', p);
    if (kind && type !== 'Expense') item.notes.push('Kind only applies to expense baskets');
    const startsCell = parseDate(cell(row, m, 'starts'), dayFirst);
    if (startsCell.invalid) p.push('Starts is not a date (use dd/mm/yyyy)');
    const repeatsWord = oneOf(cell(row, m, 'repeats'), MONEY_OPTIONS.basketRepeats, 'Repeats', p);
    const repeats = repeatsWord === 'This month only' ? 'once' : 'monthly';
    const category = cellText(cell(row, m, 'category'));
    const cat = category ? categoryOf(category, type ?? 'Expense') : undefined;
    if (category && !cat) item.notes.push(`No category called "${category}"; the basket has none`);
    const v: BasketValues = {
      name,
      type: type ?? 'Expense',
      kind: (type ?? 'Expense') === 'Expense' ? (kind ?? 'Fixed') : repeats === 'monthly' ? 'Fixed' : 'Variable',
      category: cat?.name ?? '',
      categoryId: cat?.id ?? null,
      startMonth: startsCell.date ? startsCell.date.slice(0, 7) : thisMonth,
      repeats,
      paidFrom: cellText(cell(row, m, 'paidFrom')),
    };
    item.values = v;
    item.text = [`${BASKET_TYPE_WORD[v.type]}${v.type === 'Expense' ? `, ${v.kind}` : ''}`, v.repeats === 'monthly' ? `every month from ${v.startMonth}` : `${v.startMonth} only`, v.paidFrom ? `paid from ${v.paidFrom}` : '']
      .filter(Boolean)
      .join(', ');
    if (v.paidFrom) resolveWallet(v.paidFrom, sheet);
    if (!name) p.push('Name is empty');
    else {
      const k = `${v.type}|${nameKey(name)}`;
      if (fileBasketsTyped.has(k)) sameFile(item, fileBasketsTyped.get(k)!);
      else {
        fileBasketsTyped.set(k, item);
        if (!fileBaskets.has(nameKey(name))) fileBaskets.set(nameKey(name), item);
        const hit = existing.baskets.find((b) => nameKey(b.name) === nameKey(name) && b.type === v.type);
        if (hit) {
          dup(item, hit.id, hit.name, hit.archived);
          if (v.type === 'Expense' && kind) diff(item.changes, 'Kind', hit.kind, v.kind);
          if (v.categoryId && v.categoryId !== hit.categoryId) item.changes.push({ field: 'Category', from: existing.categories.find((c) => c.id === hit.categoryId)?.name ?? 'empty', to: v.category });
          const walletName = existing.wallets.find((w) => `account:${w.id}` === hit.defaultPaidFrom)?.name ?? null;
          if (v.paidFrom && nameKey(walletName) !== nameKey(v.paidFrom)) item.changes.push({ field: 'Default paid from', from: walletName ?? 'empty', to: v.paidFrom });
        }
      }
    }
    items.push(item);
  });

  /** The basket a name points to (any type): a row, an existing one (linked), or a new Expenses basket. */
  const resolveBasket = (name: string, sheet: string, type?: BasketType): MoneyItem => {
    const k = nameKey(name);
    const inFile = type ? fileBasketsTyped.get(`${type}|${k}`) : fileBaskets.get(k);
    if (inFile) return inFile;
    const t: BasketType = type ?? 'Expense';
    const item = base('basket', sheet, null, name, 'Baskets');
    const hit = exBasket(name, type);
    item.values = { name, type: hit?.type ?? t, kind: hit?.kind ?? 'Fixed', category: '', categoryId: hit?.categoryId ?? null, startMonth: thisMonth, repeats: 'monthly', paidFrom: '' } as BasketValues;
    if (hit) linked(item, hit.id, hit.name, hit.archived);
    else item.text = `${BASKET_TYPE_WORD[t]}${t === 'Expense' ? ', Fixed' : ''}, every month from ${thisMonth}`;
    const v = item.values as BasketValues;
    fileBasketsTyped.set(`${v.type}|${k}`, item);
    if (!fileBaskets.has(k)) fileBaskets.set(k, item);
    items.push(item);
    return item;
  };
  const basketIdOf = (b: MoneyItem) => (b.match && !b.match.sameFile ? b.match.id : null);

  // ---- Basket items (name inside its basket) ----
  const fileItems = new Map<string, MoneyItem>();
  const existingItem = (basketId: string | null, name: string) => (basketId ? existing.items.find((i) => i.basketId === basketId && nameKey(i.name) === nameKey(name)) : undefined);
  const NEC_WORD: Record<string, string> = { MustHave: 'Must have', NiceToHave: 'Nice to have' };
  usesRows(input.items, (row, m, n, sheet) => {
    const basketName = cellText(cell(row, m, 'basket'));
    const name = cellText(cell(row, m, 'name'));
    const item = base('basketItem', sheet, n, name, basketName || 'No basket');
    const p = item.problems;
    const need = oneOf(cell(row, m, 'need'), MONEY_OPTIONS.needs, 'Need', p);
    const priority = oneOf(cell(row, m, 'priority'), MONEY_OPTIONS.priorities, 'Priority', p);
    const repeatsWord = oneOf(cell(row, m, 'repeats'), MONEY_OPTIONS.itemRepeats, 'Repeats', p);
    const automationText = nameKey(cell(row, m, 'automation'));
    const automation = automationText ? AUTOMATION[automationText] : 'off';
    if (!automation) p.push(`Automation must be Off, Remind me or Prepare for confirmation, not "${cellText(cell(row, m, 'automation'))}"`);
    const dueRaw = cell(row, m, 'due');
    const dueText = cellText(dueRaw);
    let dueDay: number | null = null;
    let dueDate: string | null = null;
    if (dueText && /^\d{1,2}$/.test(dueText)) {
      dueDay = Number(dueText);
      if (dueDay < 1 || dueDay > 31) p.push('Due day must be 1 to 31');
    } else if (dueText) {
      const d = parseDate(dueRaw, dayFirst);
      if (d.date) dueDate = d.date;
      else p.push('Due day or date must be a day (5) or a date (dd/mm/yyyy)');
    }
    const notBefore = parseDate(cell(row, m, 'notBefore'), dayFirst);
    const neededBy = parseDate(cell(row, m, 'neededBy'), dayFirst);
    if (notBefore.invalid) p.push('Not before is not a date (use dd/mm/yyyy)');
    if (neededBy.invalid) p.push('Needed by is not a date (use dd/mm/yyyy)');
    const v: BasketItemValues = {
      basket: basketName,
      name,
      amount: amount(cell(row, m, 'amount'), 'Amount', p) ?? 0,
      necessity: need === 'Nice to have' ? 'NiceToHave' : 'MustHave',
      priority: (priority ?? 'Medium') as Priority,
      frequency: repeatsWord === "Doesn't repeat" ? null : ((repeatsWord as 'Monthly' | 'Weekly' | null) ?? null),
      dueDay,
      dueDate,
      paidFrom: cellText(cell(row, m, 'paidFrom')),
      automation: automation ?? 'off',
      notBefore: notBefore.date,
      neededBy: neededBy.date,
      splittable: yesNo(cell(row, m, 'splittable'), 'Splittable', p) ?? false,
    };
    if (v.amount < 0) p.push('Amount cannot be negative');
    if (!basketName) p.push('Basket is empty (an item belongs to a basket)');
    if (!name) p.push('Name is empty');
    let basket: MoneyItem | null = null;
    if (basketName) {
      basket = resolveBasket(basketName, sheet);
      const bv = basket.values as BasketValues;
      if (v.frequency === null && !repeatsWord && bv.kind === 'Fixed') v.frequency = 'Monthly';
      if (bv.kind === 'Fixed' && v.frequency && v.dueDay === null && v.dueDate === null) p.push('An item in a Fixed basket needs a Due day or date');
      if (!v.paidFrom && bv.paidFrom) v.paidFrom = bv.paidFrom;
    }
    if (v.paidFrom) resolveWallet(v.paidFrom, sheet);
    item.values = v;
    item.text = [
      money(v.amount),
      `${NEC_WORD[v.necessity]} · ${v.priority}`,
      v.frequency ? v.frequency.toLowerCase() : 'once',
      v.dueDay ? `due on day ${v.dueDay}` : v.dueDate ? `due ${v.dueDate}` : '',
      v.paidFrom ? `from ${v.paidFrom}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    if (basket && name) {
      const k = `${nameKey(basketName)}|${nameKey(name)}`;
      if (fileItems.has(k)) sameFile(item, fileItems.get(k)!);
      else {
        fileItems.set(k, item);
        const hit = existingItem(basketIdOf(basket), name);
        if (hit) {
          dup(item, hit.id, hit.name, false);
          diff(item.changes, 'Amount', money(hit.amount), money(v.amount));
          if (need) diff(item.changes, 'Need', NEC_WORD[hit.necessity] ?? hit.necessity, NEC_WORD[v.necessity]);
          if (priority) diff(item.changes, 'Priority', hit.priority, v.priority);
          if (v.dueDay) diff(item.changes, 'Due day', hit.dueDay, v.dueDay);
          if (repeatsWord) diff(item.changes, 'Repeats', hit.frequency ?? "Doesn't repeat", v.frequency ?? "Doesn't repeat");
        }
      }
    }
    items.push(item);
  });

  // ---- Income sources: items of an Income basket ----
  const incomeBaskets = existing.baskets.filter((b) => b.type === 'Income' && !b.archived);
  const incomeItems = existing.items.filter((i) => incomeBaskets.some((b) => b.id === i.basketId));
  const fileIncome = new Map<string, MoneyItem>();
  let incomeBasket: MoneyItem | null = null;
  usesRows(input.income, (row, m, n, sheet) => {
    const name = cellText(cell(row, m, 'name'));
    if (!incomeBasket) {
      const named = [...fileBasketsTyped.values()].find((b) => (b.values as BasketValues).type === 'Income');
      incomeBasket = named ?? resolveBasket(incomeBaskets[0]?.name ?? 'Income', sheet, 'Income');
    }
    const item = base('income', sheet, n, name, incomeBasket.name);
    const p = item.problems;
    const dayText = cellText(cell(row, m, 'day'));
    const day = dayText ? Number(dayText) : null;
    if (dayText && (!Number.isInteger(day) || day! < 1 || day! > 31)) p.push('Expected day must be 1 to 31');
    const subtypeText = nameKey(cell(row, m, 'subtype'));
    const subtype = subtypeText ? SUBTYPE[subtypeText] : 'earned';
    if (!subtype) p.push(`Subtype must be Earned, Other or Debt financing, not "${cellText(cell(row, m, 'subtype'))}"`);
    const v: IncomeValues = {
      name,
      amount: amount(cell(row, m, 'amount'), 'Amount', p) ?? 0,
      day,
      frequency: oneOf(cell(row, m, 'repeats'), MONEY_OPTIONS.incomeRepeats, 'Repeats', p) ?? 'Monthly',
      subtype: subtype ?? 'earned',
      wallet: cellText(cell(row, m, 'wallet')),
      basket: incomeBasket.name,
    };
    if (v.frequency !== 'Once' && !v.day) p.push('A repeating income needs an Expected day');
    if (v.wallet) resolveWallet(v.wallet, sheet);
    item.values = v;
    item.text = [money(v.amount), v.frequency.toLowerCase(), v.day ? `on day ${v.day}` : '', v.wallet ? `into ${v.wallet}` : ''].filter(Boolean).join(', ');
    if (!name) p.push('Name is empty');
    else if (fileIncome.has(nameKey(name))) sameFile(item, fileIncome.get(nameKey(name))!);
    else {
      fileIncome.set(nameKey(name), item);
      const hit = incomeItems.find((i) => nameKey(i.name) === nameKey(name));
      if (hit) {
        dup(item, hit.id, hit.name, false);
        item.match = { ...item.match!, id: `${hit.basketId}/${hit.id}` };
        diff(item.changes, 'Amount', money(hit.amount), money(v.amount));
        if (v.day) diff(item.changes, 'Expected day', hit.dueDay, v.day);
      }
    }
    items.push(item);
  });

  return settle(items);
}

function sameFile(item: MoneyItem, first: MoneyItem) {
  item.status = 'duplicate';
  item.match = { id: first.key, name: first.name, sameFile: true };
  item.notes.push(first.rowNumber ? `Same as row ${first.rowNumber} of ${first.sheet}` : 'Same as a name used earlier in the file');
}
function dup(item: MoneyItem, id: string, name: string, archived: boolean) {
  item.status = 'duplicate';
  item.match = { id, name, archived };
}
function linked(item: MoneyItem, id: string, name: string, archived: boolean) {
  item.status = 'linked';
  item.match = { id, name, archived };
}
