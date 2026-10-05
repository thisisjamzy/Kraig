'use client';

// Wallets on tablet and web, full width: "Wallets" with four properties
// (Total across wallets, In savings wallets, Committed this month: unpaid
// lines paid from wallets, Free after commitments, colored by state); then
// the wallets database, a Table grouped by type (Mobile money, Bank, Card,
// Cash, Savings) with each group's subtotal and the total in the footer,
// or Cards (3 to 4 a row: name, type, balance, committed and free).
// "New wallet" is in the database toolbar. A wallet opens its page.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLogic, type WalletRow } from '@/src/logic/wallets/useLogic';
import { WALLET_GROUPS } from '@/src/logic/wallets/model';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { Database } from '@/src/widgets/Database/Database';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/widgets/Database/types';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { AddWalletSheet } from './AddWalletSheet';
import styles from './WalletsScreen.module.css';

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function WalletsScreen() {
  const router = useRouter();
  const v = useLogic();
  const hidden = useAmountsHidden();
  const money = (n: number) => (hidden ? HIDDEN_AMOUNT : `${formatNumber(n)} ${v.currency}`);

  const columns: ColumnDef<WalletRow>[] = [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      width: 220,
      value: (r) => r.name,
      render: (r) => (
        <span className={styles.name}>
          <span className={styles.dot} style={{ background: r.color }} aria-hidden />
          {r.name}
        </span>
      ),
    },
    { id: 'type', label: 'Type', type: 'text', width: 150, value: (r) => r.type },
    { id: 'balance', label: 'Balance', type: 'currency', width: 140, value: (r) => r.balance, calc: 'sum', onCard: true },
    { id: 'committed', label: 'Committed this month', type: 'currency', width: 170, value: (r) => r.committed, onCard: true },
    { id: 'free', label: 'Free after commitments', type: 'currency', width: 180, value: (r) => r.free, tone: (r) => (r.freeTone === 'good' ? undefined : r.freeTone), onCard: true },
    { id: 'activity', label: 'Last activity', type: 'date', width: 130, value: (r) => r.lastActivity, render: (r) => (r.lastActivity ? day(r.lastActivity) : null) },
    {
      id: 'usable',
      label: 'Usable for the plan',
      type: 'text',
      width: 150,
      value: (r) => (r.usableForPlan === null ? null : r.usableForPlan ? 'Yes' : 'No'),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      width: 110,
      value: (r) => r.status,
      options: [
        { value: 'Active', label: 'Active' },
        { value: 'Archived', label: 'Archived' },
      ],
    },
  ];

  return (
    <NotionPage
      title="Wallets"
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Wallets' }]}
      properties={[
        { id: 'total', label: 'Total across wallets', display: money(v.totals.total) },
        { id: 'savings', label: 'In savings wallets', tone: 'in', display: money(v.totals.inSavings) },
        { id: 'committed', label: 'Committed this month', tone: 'out', display: money(v.totals.committed), sub: 'Unpaid lines paid from wallets' },
        { id: 'free', label: 'Free after commitments', tone: v.freeTotalTone, display: money(v.totals.free) },
      ]}
    >
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && (
        <Database<WalletRow>
          id="wallets.page"
          label="Wallets"
          noun={['wallet', 'wallets']}
          rows={v.rows}
          rowKey={(r) => r.id}
          columns={columns}
          views={[
            { id: 'table', name: 'Table', layout: 'table', group: 'type' },
            { id: 'cards', name: 'Cards', layout: 'cards' },
          ]}
          groups={[{ id: 'type', label: 'Type', key: (r) => ({ key: r.group, label: r.group }), order: [...WALLET_GROUPS] }]}
          defaultGroup="type"
          subtotalColumn="balance"
          card={{
            title: (r) => r.name,
            render: (r) => (
              <Link href={`/wallets/${r.id}`} className={styles.card} data-archived={r.status === 'Archived' || undefined}>
                <span className={styles.name}>
                  <span className={styles.dot} style={{ background: r.color }} aria-hidden />
                  <strong>{r.name}</strong>
                </span>
                <span className={styles.cardType}>{r.type}</span>
                <span className={styles.cardBalance}>{money(r.balance)}</span>
                <span className={styles.cardSub}>Committed {money(r.committed)}</span>
                <span className={styles.cardSub} data-tone={r.freeTone}>
                  Free {money(r.free)}
                </span>
              </Link>
            ),
          }}
          onOpen={(r) => router.push(`/wallets/${r.id}`)}
          onNew={() => v.openAddWallet()}
          newLabel="New wallet"
          emptyText="No wallets yet."
        />
      )}
      {v.addOpen && <AddWalletSheet v={v} />}
    </NotionPage>
  );
}
