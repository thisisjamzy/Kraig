'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { query, orderBy, limit } from 'firebase/firestore';
import { ArrowUpRight, ArrowDownLeft, PiggyBank, type LucideIcon } from 'lucide-react';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { transactionsRef } from '@/src/shared/firestore/refs';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { toDisplay } from '@/src/shared/firestore/currency';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { walletColor } from '@/src/viewmodels/wallets';
import type { FirestoreTransaction } from '@/src/shared/firestore/types';

// Same set Add Transaction's type step uses (src/logic/addTransaction) —
// keyed by FirestoreTransaction.type (Title-Case), Transfer excluded since
// this screen only reads the transactions collection, never transfers.
const TYPE_ICONS: Record<string, LucideIcon> = {
  Expense: ArrowUpRight,
  Income: ArrowDownLeft,
  Savings: PiggyBank,
};

const PAGE_SIZE = 100;

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(ts: FirestoreTransaction['date']) {
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export function useLogic() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const transactionsQuery = useMemo(
    () => (uid ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(PAGE_SIZE)) : null),
    [uid]
  );
  const {
    data: transactionDocs,
    loading: transactionsLoading,
    error: transactionsError,
  } = useFirestoreCollection<FirestoreTransaction>(transactionsQuery);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  // Same color-per-account convention Home's wallet chart and Wallets use
  // (src/viewmodels/wallets.ts's walletColor, keyed by an account's own
  // fixed position in the accounts list) — every row for the same account
  // gets the same colored circle, rather than a color that just cycles by
  // row position and means nothing.
  const accountColor = useMemo(
    () => new Map(accounts.map((account, index) => [account.id, walletColor(index)])),
    [accounts]
  );
  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (categoryId: string | null) => (categoryId && map.get(categoryId)) || categoryId || '—';
  }, [categories]);

  const transactions = transactionDocs.map((transaction) => {
    const account = accountById.get(transaction.accountId);
    return {
      id: transaction.id,
      title: categoryName(transaction.categoryId),
      description: transaction.description,
      account: account?.name ?? transaction.accountId,
      amount: toDisplay(ctx, transaction.amount, account?.currency ?? ctx.base),
      currency: ctx.display,
      date: formatDate(transaction.date),
      icon: TYPE_ICONS[transaction.type] ?? ArrowUpRight,
      iconColor: accountColor.get(transaction.accountId) ?? walletColor(0),
    };
  });

  function goBack() {
    router.push('/home');
  }

  function editHref(id: string) {
    return `/edit-transaction/${id}`;
  }

  return {
    transactions,
    loading: authLoading || transactionsLoading || accountsLoading || categoriesLoading || ctxLoading,
    error: transactionsError,
    editHref,
    goBack,
  };
}
