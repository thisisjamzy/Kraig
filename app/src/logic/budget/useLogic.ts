'use client';

import { useMemo, useState } from 'react';
import { query, where, orderBy, limit, updateDoc, Timestamp } from 'firebase/firestore';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { statsMonthlyRef, transactionsRef, transfersRef, settingsRef } from '@/src/shared/firestore/refs';
import { useCategories, useExchangeRates } from '@/src/shared/firestore/queries';
import { toDisplay, round2 } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { currentMonthIndex, currentYear } from '@/src/viewmodels/budget';
import { currencyName } from '@/src/viewmodels/currencies';
import { isSavingsAccount } from '@/src/viewmodels/wallets';
import { savingsTransactionFlow, savingsTransferFlow } from '@/src/viewmodels/savingsTransfers';
import { categoryAccentColor } from '@/src/viewmodels/categories';
import type { StatsMonthly, FirestoreTransaction, FirestoreTransfer } from '@/src/shared/firestore/types';

export type BudgetView = 'category' | 'bucket';

// Same set src/logic/transactionHistory/useLogic.ts's own card list uses —
// this panel now renders with that same card, so the icon needs to match.
const TYPE_ICONS: Record<string, LucideIcon> = {
  Expense: ArrowUpRight,
  Income: ArrowDownLeft,
  Savings: PiggyBank,
};

// PRD-BUDGET-TRANSACTIONS.md section 3.2 — the Budget screen's own preview
// is deliberately small (a busy household can log 40+ transactions in a
// month); "View all" opens the full month-scoped list instead. The "View
// all" link itself only renders when more than this many exist (see
// BudgetScreen.tsx) — no point linking to "everything" when the preview
// already shows everything.
const MONTH_TRANSACTIONS_PREVIEW_SIZE = 4;
// Same cap src/logic/transactionHistory/useLogic.ts's own month view uses —
// generous enough for a household's real monthly transaction volume.
const MONTH_ALL_TRANSACTIONS_PAGE_SIZE = 300;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// Add Transaction's "no budget for this category this month" prompt
// (src/logic/addTransaction/useLogic.ts) deep-links here with the month it
// was looking at (?month=0-11&year=YYYY), so tapping "Add a budget" opens
// straight on that month instead of the real current one. Read directly off
// window.location.search rather than useSearchParams() so this screen
// doesn't need a Suspense boundary — it's 'use client'-only, nothing here
// is ever server-rendered.
function monthTargetFromSearch(): { year: number; month: number } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const monthParam = params.get('month');
  const yearParam = params.get('year');
  if (monthParam === null || yearParam === null) return null;
  const month = Number(monthParam);
  const year = Number(yearParam);
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) return null;
  return { year, month };
}

export function useLogic() {
  // The month/year shown here is just which month's plan you're viewing —
  // it never touches the app's real current date after the initial load.
  // Defaults to today's month, unless a ?month=&year= deep link (from Add
  // Transaction's "Add a budget" prompt) says otherwise.
  const [monthTarget] = useState(monthTargetFromSearch);
  const [monthIndex, setMonthIndex] = useState(() => monthTarget?.month ?? currentMonthIndex());
  const [year, setYear] = useState(() => monthTarget?.year ?? currentYear());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  const monthStr = `${year}-${pad2(monthIndex + 1)}`;
  // Header subtitle — now that the tracking table below carries its own
  // Expenses row (projected vs. actual), the space under the month name no
  // longer needs to repeat "left to spend" there too. Only meaningful for
  // the real current month; browsing a past/future month has no "days
  // left" to show.
  const daysLeftInMonth = useMemo(() => {
    const today = new Date();
    if (year !== today.getFullYear() || monthIndex !== today.getMonth()) return null;
    const daysInThisMonth = new Date(year, monthIndex + 1, 0).getDate();
    return Math.max(0, daysInThisMonth - today.getDate());
  }, [year, monthIndex]);
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const { data: statsMonthly, loading: statsLoading } = useFirestoreDoc<StatsMonthly>(
    useMemo(() => (uid ? statsMonthlyRef(uid, monthStr) : null), [uid, monthStr])
  );
  // This month's savings flow (the tracking table's Savings "actual") is
  // account-type based, not item based, so it still reads the month's raw
  // transactions/transfers itself.
  const monthAllTransactionsQuery = useMemo(
    () => (uid ? query(transactionsRef(uid), where('month', '==', monthStr), limit(MONTH_ALL_TRANSACTIONS_PAGE_SIZE)) : null),
    [uid, monthStr]
  );
  const { data: monthAllTransactionDocs, loading: monthAllTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(monthAllTransactionsQuery);
  // Savings can also move via a transfer (wallet -> savings, or any transfer
  // that happens to touch a Savings Account) — FirestoreTransfer has no
  // `month` field to filter on directly, so this is a plain date-range query
  // over this viewed month's own bounds instead.
  const monthTransfersQuery = useMemo(() => {
    if (!uid) return null;
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return query(transfersRef(uid), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)));
  }, [uid, year, monthIndex]);
  const { data: monthTransferDocs, loading: monthTransfersLoading } =
    useFirestoreCollection<FirestoreTransfer>(monthTransfersQuery);
  // A Savings Account's currentBalance is always TODAY's live total, never a
  // snapshot — so browsing a past month can't just read it directly, that
  // would show today's balance labeled as January's. Reconstructing what it
  // was at the end of that past month instead: today's live total minus
  // every savings flow (transaction + transfer) that happened strictly
  // after that month closed. For the current/a future month there's nothing
  // "after" it yet, so the live total already IS the right answer and these
  // two queries stay off.
  const isPastMonth = year < currentYear() || (year === currentYear() && monthIndex < currentMonthIndex());
  const sinceMonthEndTransactionsQuery = useMemo(() => {
    if (!uid || !isPastMonth) return null;
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return query(transactionsRef(uid), where('date', '>', Timestamp.fromDate(end)));
  }, [uid, isPastMonth, year, monthIndex]);
  const { data: sinceMonthEndTransactionDocs, loading: sinceMonthEndTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(sinceMonthEndTransactionsQuery);
  const sinceMonthEndTransfersQuery = useMemo(() => {
    if (!uid || !isPastMonth) return null;
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return query(transfersRef(uid), where('date', '>', Timestamp.fromDate(end)));
  }, [uid, isPastMonth, year, monthIndex]);
  const { data: sinceMonthEndTransferDocs, loading: sinceMonthEndTransfersLoading } =
    useFirestoreCollection<FirestoreTransfer>(sinceMonthEndTransfersQuery);
  // PRD-BUDGETS-V2.md section 5 — the whole month's budget, derived from
  // bucket items + linked transactions + the allocation ledger. Categories
  // here are only a read-only lens over those items; there's no longer a
  // per-category budget to create, edit, or delete.
  const {
    budget,
    transactionsById,
    transfersById,
    buckets,
    itemsByBucket,
    allocations,
    accounts,
    ctx,
    loading: budgetLoading,
  } = useMonthBudget(monthStr);
  const [view, setView] = useState<BudgetView>('category');
  // The item-month sheet (src/screens/BucketItemMonth) — keyed by
  // ItemMonth.key so it follows live updates to that entry.
  const [openItemKey, setOpenItemKey] = useState<string | null>(null);
  const openItem = openItemKey ? budget.itemsByKey.get(openItemKey) ?? null : null;

  const accountCurrency = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const accountType = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const { data: allCategories } = useCategories();
  const categoryName = useMemo(() => new Map(allCategories.map((c) => [c.id, c.name])), [allCategories]);

  const currency = ctx.display;
  // Currency badge on the total card — same switch-and-persist write
  // Settings' own currency picker and Home's currency chip make (see
  // src/logic/home/useLogic.ts), just surfaced as a compact menu here
  // instead of a full picker modal. exchangeRates' own doc IDs are the
  // selectable codes — currencyName only supplies a human label for one.
  const { data: exchangeRates } = useExchangeRates();
  const currencyOptions = useMemo(
    () => exchangeRates.map((rate) => ({ code: rate.id, name: currencyName(rate.id) })),
    [exchangeRates]
  );
  const [currencySaving, setCurrencySaving] = useState(false);
  async function setCurrency(code: string) {
    if (currencySaving || !uid || code === currency) return;
    setCurrencySaving(true);
    try {
      await updateDoc(settingsRef(uid), { displayCurrency: code });
    } finally {
      setCurrencySaving(false);
    }
  }

  const sumItems = (type: string, pick: 'planned' | 'actual') =>
    round2(budget.items.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry[pick], 0));
  const sumCategories = (type: string) =>
    round2(budget.categories.filter((group) => group.type === type).reduce((sum, group) => sum + group.actual, 0));
  const plannedIncome = budget.plannedIncome;
  const plannedSavings = sumItems('Savings', 'planned');
  const totalExpenseBudgeted = sumItems('Expense', 'planned');
  const totalExpenseSpent = sumCategories('Expense');
  // "Left to budget" is the month's pool: planned income no item claims
  // yet, moved by every allocation into/out of it. Negative = the plan
  // itself spends more than it expects to earn.
  const isOverspending = budget.pool < 0;
  const overspendAmount = round2(Math.max(0, -budget.pool));
  const leftToBudget = round2(Math.max(0, budget.pool));

  // Overspends nobody has funded yet, and leftovers that could move —
  // the two strips above the category list (section 6.1). Leftovers only
  // surface once they're real: the month is over, or a Planned item was
  // closed with money unspent.
  const monthEnded = isPastMonthOf(year, monthIndex);
  const needsAttention = useMemo(() => budget.items.filter((entry) => entry.unfunded > 0), [budget.items]);
  const leftovers = useMemo(
    () =>
      budget.items.filter(
        (entry) => entry.type !== 'Income' && entry.remaining > 0 && (monthEnded || entry.closed)
      ),
    [budget.items, monthEnded]
  );

  // Actual income for the month — derived from real transactions, never
  // typed in, and — same bottom-up shift as planned above — summed per
  // category rather than off one flat statsMonthly.totalIncome figure, so a
  // transaction against any Income category (budgeted this month or not)
  // always moves the actual total. A month with nothing logged yet just
  // reads 0/0%; there's no other way to know what actually came in.
  // Floored at 0 — a correction/refund against an Income category can drive
  // the raw sum below zero, but "money received this month" reading negative
  // would only confuse the summary card, so it never displays as such.
  const actualIncome = Math.max(0, budget.actualIncome);
  // Savings is account-type based now, not category based (see
  // src/viewmodels/savingsTransfers.ts). The tracking table's Savings row
  // carries two different "actual" figures side by side: this month's real
  // flow into/out of Savings Accounts (actualSavingsThisMonth, so it reads
  // the same way as Income/Expenses' own actual-this-month figure), and the
  // live compounding total across every Savings Account regardless of when
  // it was saved (cumulativeSavings) — a Savings Account's own
  // currentBalance already bakes in every transaction/transfer that ever
  // touched it, so the cumulative figure needs no query of its own.
  const actualSavingsThisMonth = round2(
    monthAllTransactionDocs.reduce(
      (sum, t) => sum + toDisplay(ctx, savingsTransactionFlow(t, accountType), accountCurrency.get(t.accountId) ?? ctx.base),
      0
    ) +
      monthTransferDocs.reduce(
        (sum, t) => sum + toDisplay(ctx, savingsTransferFlow(t, accountType), accountCurrency.get(t.fromAccountId) ?? ctx.base),
        0
      )
  );
  const liveCumulativeSavings = round2(
    accounts
      .filter(isSavingsAccount)
      .reduce((sum, account) => sum + toDisplay(ctx, account.currentBalance, account.currency), 0)
  );
  // Undo every savings flow that happened after the viewed month closed,
  // landing back on what the cumulative total actually was at that month's
  // end rather than today's.
  const savingsFlowSinceMonthEnd = isPastMonth
    ? round2(
        sinceMonthEndTransactionDocs.reduce(
          (sum, t) => sum + toDisplay(ctx, savingsTransactionFlow(t, accountType), accountCurrency.get(t.accountId) ?? ctx.base),
          0
        ) +
          sinceMonthEndTransferDocs.reduce(
            (sum, t) => sum + toDisplay(ctx, savingsTransferFlow(t, accountType), accountCurrency.get(t.fromAccountId) ?? ctx.base),
            0
          )
      )
    : 0;
  const cumulativeSavings = isPastMonth ? round2(liveCumulativeSavings - savingsFlowSinceMonthEnd) : liveCumulativeSavings;
  // A percent-of-target badge doesn't say anything useful on its own ("85%"
  // of what, in which direction?) — the tracking table's Income/Expenses
  // rows now carry the actual gap amount instead. Income: how much more or
  // less came in than was planned (positive = received more than planned).
  // Expenses: how far over the budgeted amount spending actually went
  // (positive = overspent by that much; zero or negative = at or under
  // budget).
  const incomeVariance = round2(actualIncome - plannedIncome);
  const expenseOverBudget = round2(totalExpenseSpent - totalExpenseBudgeted);

  function openMonthPicker() {
    setPickerYear(year);
    setMonthPickerOpen(true);
  }

  function chooseMonth(index: number) {
    setMonthIndex(index);
    setYear(pickerYear);
    setMonthPickerOpen(false);
  }

  // Where the "Record Transaction" button (PRD-BUDGET-TRANSACTIONS.md
  // section 3.2) sends them — Add Transaction, pre-dated into whichever
  // month this screen is showing (src/logic/addTransaction/useLogic.ts
  // reads these same two params). Always visible now (it replaced the old
  // bottom-of-page button that only showed on a non-current month — see
  // section 8, decision 1), so there's no separate visibility flag anymore.
  const retroTransactionHref = `/add-transaction?month=${monthIndex}&year=${year}`;

  // "This Month's Transactions" panel preview (PRD-BUDGET-TRANSACTIONS.md
  // section 3.2) — reuses the existing (month ASC, date DESC) index, no new
  // index needed (section 2.3).
  const monthTransactionsQuery = useMemo(
    () =>
      uid
        ? query(
            transactionsRef(uid),
            where('month', '==', monthStr),
            orderBy('date', 'desc'),
            limit(MONTH_TRANSACTIONS_PREVIEW_SIZE)
          )
        : null,
    [uid, monthStr]
  );
  const { data: monthTransactionDocs, loading: monthTransactionsLoading } =
    useFirestoreCollection<FirestoreTransaction>(monthTransactionsQuery);

  // Same card shape src/logic/transactionHistory/useLogic.ts's own list
  // uses — this panel renders with that exact same card component styling.
  const monthTransactions = useMemo(
    () =>
      monthTransactionDocs.map((transaction) => {
        const nativeCurrency = accountCurrency.get(transaction.accountId) ?? ctx.base;
        const title = categoryName.get(transaction.categoryId ?? '') ?? transaction.categoryId ?? '—';
        return {
          id: transaction.id,
          title,
          description: transaction.description,
          account: accountName.get(transaction.accountId) ?? transaction.accountId,
          amount: round2(toDisplay(ctx, transaction.amount, nativeCurrency)),
          currency: ctx.display,
          date: transaction.date.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
          icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
          iconColor: categoryAccentColor(title),
          editHref: `/edit-transaction/${transaction.id}`,
        };
      }),
    [monthTransactionDocs, accountCurrency, accountName, categoryName, ctx]
  );
  // The preview only ever fetches MONTH_TRANSACTIONS_PREVIEW_SIZE — the real
  // total for "View all N transactions this month" comes from the same
  // statsMonthly doc the Budget screen's own totals already read.
  const monthTransactionCount = statsMonthly?.transactionCount ?? 0;
  // Month-scoped (not category-scoped) transaction list — the same
  // TransactionHistoryScreen the category drill-down uses, filtered by
  // month instead (PRD-BUDGET-TRANSACTIONS.md section 3.3).
  const viewAllMonthTransactionsHref = `/transactions?month=${monthIndex}&year=${year}`;

  return {
    monthIndex,
    year,
    daysLeftInMonth,
    retroTransactionHref,
    monthTransactions,
    monthTransactionsLoading,
    monthTransactionCount,
    viewAllMonthTransactionsHref,
    // Planning happens in Buckets now — the Budget screen only reads it.
    planHref: '/buckets',
    monthStr,
    budget,
    view,
    setView,
    openItem,
    setOpenItemKey,
    transactionsById,
    transfersById,
    buckets,
    itemsByBucket,
    allocations,
    needsAttention,
    leftovers,
    monthPickerOpen,
    setMonthPickerOpen,
    pickerYear,
    setPickerYear,

    currency,
    currencyOptions,
    setCurrency,
    totalExpenseBudgeted,
    totalExpenseSpent,
    leftToBudget,
    plannedIncome,
    plannedSavings,
    actualIncome,
    actualSavingsThisMonth,
    cumulativeSavings,
    incomeVariance,
    expenseOverBudget,
    overspendAmount,
    isOverspending,
    loading:
      authLoading ||
      budgetLoading ||
      statsLoading ||
      monthAllTransactionsLoading ||
      monthTransfersLoading ||
      sinceMonthEndTransactionsLoading ||
      sinceMonthEndTransfersLoading,
    error: null,
    openMonthPicker,
    chooseMonth,
  };
}

function isPastMonthOf(year: number, monthIndex: number) {
  return year < currentYear() || (year === currentYear() && monthIndex < currentMonthIndex());
}
