'use client';

// A wallet's page on tablet and web: its name over its type; properties
// (Balance, Committed this month, Free after commitments, Last
// reconciled); the balance at each month end; the upcoming payments paid
// from it this month; its transactions (Week, Month or Quarter). Edit
// wallet and Reconcile are in the top bar's "..." menu.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLogic } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { Block, NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './WalletDetailScreen.module.css';

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function WalletDetailScreen({ walletId }: { walletId: string }) {
  const strings = useStrings();
  const router = useRouter();
  const formLink = useFormLink();
  const v = useLogic(walletId, strings.walletDetail.periods);
  const hidden = useAmountsHidden();
  const money = (n: number) => (hidden ? HIDDEN_AMOUNT : `${formatNumber(n)} ${v.currency}`);
  type Tx = (typeof v.transactions)[number];

  const columns: ColumnDef<Tx>[] = [
    { id: 'date', label: 'Date', type: 'date', width: 110, value: (r) => r.when, render: (r) => day(r.when) },
    { id: 'name', label: 'Name', type: 'text', width: 240, value: (r) => r.description },
    { id: 'category', label: 'Category', type: 'text', width: 180, value: (r) => r.title || null },
    { id: 'amount', label: 'Amount', type: 'currency', width: 140, value: (r) => r.signed, calc: 'sum', tone: (r) => (r.signed < 0 ? undefined : 'good') },
  ];

  const name = v.wallet?.name ?? 'Wallet';
  return (
    <NotionPage
      title={name}
      kind={v.wallet?.type}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Wallets', href: '/wallets' }, { label: name }]}
      menu={[
        { label: 'Edit wallet', href: formLink('wallet', { id: walletId }) },
        { label: 'Reconcile', href: '/settings/reconcile' },
      ]}
      properties={[
        { id: 'balance', label: 'Balance', display: money(v.balance), sub: v.lockedAmount > 0 ? `${money(v.availableAmount)} available` : undefined },
        { id: 'committed', label: 'Committed this month', tone: 'out', display: money(v.committed) },
        { id: 'free', label: 'Free after commitments', tone: v.freeTone, display: money(v.free) },
        { id: 'reconciled', label: 'Last reconciled', display: v.lastReconciled ? v.lastReconciled.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never' },
      ]}
    >
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && v.wallet && (
        <div className={styles.blocks}>
          <Block title="Balance over time">
            <div className={styles.chart} role="img" aria-label={`Balance at each month end: ${v.balanceByMonth.map((p) => `${p.label} ${formatNumber(p.balance)}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={v.balanceByMonth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(27, 27, 57, 0.08)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={64} tickFormatter={(n: number) => (hidden ? '' : formatNumber(n))} />
                  <Tooltip formatter={(n) => money(Number(n))} />
                  <Area type="monotone" dataKey="balance" name="Balance" stroke="#3965fa" fill="rgba(57, 101, 250, 0.12)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Block>

          <Block title="Upcoming payments from this wallet">
            {v.upcomingLines.length ? (
              <ul className={styles.upcoming}>
                {v.upcomingLines.map((u) => (
                  <li key={u.key}>
                    <span className={styles.upDate}>{u.due ? day(u.due) : 'No date'}</span>
                    <Link href={u.href} className={styles.upName}>
                      {u.name}
                      <small>{u.basket}</small>
                    </Link>
                    <span className={styles.upAmount}>{money(u.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>Nothing left to pay from {name} this month.</p>
            )}
          </Block>

          <Block title="Transactions">
            <Database<Tx>
              id="wallet.transactions"
              label={`Transactions in ${name}`}
              noun={['transaction', 'transactions']}
              rows={v.transactions}
              rowKey={(r) => r.id}
              columns={columns}
              views={[
                { id: 'table', name: 'Table', layout: 'table' },
                { id: 'list', name: 'List', layout: 'list' },
              ]}
              defaultGroup="none"
              card={{ title: (r) => r.description }}
              onOpen={(r) => router.push(`/transactions/${r.id}`)}
              tabs={
                <span className={styles.periods} role="radiogroup" aria-label="Period">
                  {strings.walletDetail.periods.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={v.period === p} onClick={() => v.setPeriod(p)}>
                      {p}
                    </button>
                  ))}
                </span>
              }
              emptyText="No transactions in this period."
            />
          </Block>
        </div>
      )}
    </NotionPage>
  );
}
