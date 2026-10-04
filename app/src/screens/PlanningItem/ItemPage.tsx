'use client';

// A budget line's own page on medium screens and up (what "Open as full
// page" opens): the same title and editable properties as its side peek,
// then its payments this month as a database, and notes.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { useLogic as useItemLogic } from '@/src/logic/planningItem/useLogic';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import { itemMonthKey } from '@/src/shared/budget/monthBudget';
import { useBreadcrumb } from '@/src/widgets/AppShell/breadcrumb';
import { Database } from '@/src/widgets/Database/Database';
import { Block } from '@/src/widgets/Database/NotionPage';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import { LinePeekContent } from '@/src/screens/BudgetMonth/LinePeek';
import { useScopeChooser } from '@/src/screens/BudgetMonth/ScopeChooser';
import type { ColumnContext } from '@/src/screens/BudgetMonth/columns';
import { NotesBlock } from '@/src/screens/PlanningBucket/BucketPage';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';

type ItemLogic = ReturnType<typeof useItemLogic>;
type PaymentRow = ItemLogic['rows'][number];

export function ItemPage({ bucketId, itemId, it }: { bucketId: string; itemId: string; it: ItemLogic }) {
  const router = useRouter();
  const v = useBudgetMonth(it.month, it.data);
  const scope = useScopeChooser();
  const key = itemMonthKey(itemId, it.month);
  const line = it.entry ? (v.rows[it.entry.type].find((r) => r.key === key) ?? null) : null;
  useBreadcrumb([
    { label: 'Money', href: '/home' },
    { label: 'Baskets', href: '/baskets' },
    { label: it.bucket?.name ?? 'Basket', href: `/budget/basket/${bucketId}?month=${it.month}` },
    { label: line?.name ?? it.raw?.name ?? 'Item' },
  ]);

  if (!line) {
    return <ScreenState loading={it.loading} error={!it.loading ? 'This line is not in the budget for that month.' : null} />;
  }

  const ctx: ColumnContext = {
    month: it.month,
    daysLeft: v.daysLeft,
    past: v.phase === 'past',
    accounts: v.accounts,
    incomeLines: v.incomeLines.map((l) => ({ itemId: l.itemId, name: l.name })),
    askScope: (l) => scope.ask(l.name, it.month),
    editAmount: v.editAmount,
    editDate: v.editDate,
    setField: v.setField,
    markPaid: v.markPaid,
    onError: (message) => showToast(message),
  };

  const columns: ColumnDef<PaymentRow>[] = [
    { id: 'date', label: 'Date', type: 'date', width: 120, value: (r) => r.date },
    { id: 'name', label: 'Name', type: 'text', width: 240, value: (r) => r.note || r.name, render: (r) => <Link className={bm.relation} href={r.href}>{r.note || r.name}</Link> },
    { id: 'amount', label: 'Amount', type: 'currency', width: 130, value: (r) => Math.abs(r.amount), calc: 'sum' },
    { id: 'account', label: 'Account', type: 'text', width: 160, value: (r) => r.method },
  ];

  return (
    <div className={bm.page}>
      <LinePeekContent
        line={line}
        ctx={ctx}
        currency={it.currency}
        compactTitle={false}
        onSkip={async (l) => {
          await v.bulkSkip([l]);
          router.push(`/budget/basket/${bucketId}?month=${it.month}`);
        }}
      />
      <Block
        title="Payments"
        actions={
          <Link href={it.addExpenseHref} className={bm.ghostButton}>
            <Plus size={14} strokeWidth={2.25} aria-hidden /> Record a payment
          </Link>
        }
      >
        <Database<PaymentRow>
          id="item.payments"
          label={`Payments for ${line.name}`}
          noun={['payment', 'payments']}
          rows={it.rows}
          rowKey={(r) => r.id}
          columns={columns}
          defaultGroup="none"
          card={{ title: (r) => r.note || r.name }}
          onOpen={(r) => router.push(r.href)}
          emptyText="Nothing recorded against this line yet."
        />
      </Block>
      <Block title="Notes">
        <NotesBlock bucketId={bucketId} itemId={itemId} initial={it.raw?.notes ?? ''} />
      </Block>
      {scope.dialog}
    </div>
  );
}
