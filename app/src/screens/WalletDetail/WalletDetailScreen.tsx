'use client';

// A wallet's page on tablet and web: its name over its type; properties
// (Balance, Committed this month, Free after commitments, Last
// reconciled); the balance at each month end; the upcoming payments paid
// from it this month; all its transactions and transfers, filtered like the
// all-transactions page. Edit
// wallet and Reconcile are in the top bar's "..." menu.

import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLogic } from '@/src/logic/walletDetail/useLogic';
import { useWalletHistory } from '@/src/logic/walletDetail/useHistory';
import { HistoryView } from '@/src/screens/Planning/HistoryView';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { Block, NotionPage } from '@/src/widgets/Database/NotionPage';
import { formatNumber } from '@/src/widgets/Database/format';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './WalletDetailScreen.module.css';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function WalletDetailScreen({ walletId }: { walletId: string }) {
  const formLink = useFormLink();
  const v = useLogic(walletId);
  const h = useWalletHistory(walletId);
  const hidden = useAmountsHidden();
  const money = (n: number) => (hidden ? HIDDEN_AMOUNT : `${formatNumber(n)} ${v.currency}`);
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
                  <CartesianGrid vertical={false} stroke={styleGuide.neutrals[200]} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={64} tickFormatter={(n: number) => (hidden ? '' : formatNumber(n))} />
                  <Tooltip formatter={(n) => money(Number(n))} />
                  <Area type="monotone" dataKey="balance" name="Balance" stroke={styleGuide.brand.primary} fill={styleGuide.brand.primaryLight} strokeWidth={2} isAnimationActive={false} />
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
            <ScreenState loading={h.loading} error={h.error ? String(h.error) : null} />
            {!h.loading && !h.error && (
              <>
                <HistoryView rows={h.rows} currency={h.currency} fields={h.fields} list={h.list} stickyTop="0px" emptyText={`No transactions in ${name} yet.`} showYear />
                {h.capped && <p className={styles.empty}>Showing the latest transactions. Filter by date to find earlier ones.</p>}
              </>
            )}
          </Block>
        </div>
      )}
    </NotionPage>
  );
}
