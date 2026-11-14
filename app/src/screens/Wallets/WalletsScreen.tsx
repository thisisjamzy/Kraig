'use client';

// Wallets on tablet and web, drawn from Dreda.figcraft `Wallets / Web`:
// the title with the wallet count, four tiles (Total balance, In savings,
// Committed this month, Free after commitments), then "Your wallets": every
// active wallet as a wallet card, then Add wallet. Archived wallets follow,
// dimmed, behind "Show archived". A card opens the wallet's page.

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useLogic, type WalletRow } from '@/src/logic/wallets/useLogic';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { formatNumber } from '@/src/widgets/Database/format';
import { WalletCard, type WalletTone } from '@/src/widgets/Money/WalletCard';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { AddWalletSheet } from './AddWalletSheet';
import styles from './WalletsScreen.module.css';

const CYCLE: WalletTone[] = ['purple', 'ink', 'lilac'];

function toneFor(rows: WalletRow[]) {
  let plain = 0;
  return new Map(rows.map((r) => [r.id, r.group === 'Savings' ? ('lime' as WalletTone) : CYCLE[plain++ % CYCLE.length]]));
}

export function WalletsScreen() {
  const v = useLogic();
  const [hidden, setHidden] = useAmountsHidden();
  const [showArchived, setShowArchived] = useState(false);
  const toggleLabel = hidden ? 'Show amounts' : 'Hide amounts';
  const amount = (n: number) => (hidden ? HIDDEN_AMOUNT : formatNumber(Math.round(n)));

  const active = v.rows.filter((r) => r.status === 'Active');
  const archived = v.rows.filter((r) => r.status === 'Archived');
  const tones = toneFor(v.rows);
  const largest = [...active].sort((a, b) => b.balance - a.balance)[0];
  const savingsCount = active.filter((r) => r.group === 'Savings').length;
  const n = (k: number, one: string) => `${k} ${k === 1 ? one : `${one}s`}`;

  const card = (r: WalletRow) => (
    <Link key={r.id} href={`/wallets/${r.id}`} className={styles.cardLink} data-archived={r.status === 'Archived' || undefined} aria-label={`${r.name}, ${amount(r.balance)} ${v.currency}`}>
      <WalletCard
        tone={tones.get(r.id) ?? 'purple'}
        type={r.type}
        name={r.name}
        last4={r.id.slice(-4).toUpperCase()}
        currency={v.currency}
        available={amount(r.balance)}
        required={r.committed > 0.5 ? amount(r.committed) : '*****'}
      />
    </Link>
  );

  return (
    <NotionPage
      title="Wallets"
      sub={`${n(active.length, 'wallet')}${archived.length ? ` · ${archived.length} archived` : ''}`}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Wallets' }]}
      menu={[{ label: toggleLabel, onSelect: () => setHidden(!hidden) }]}
      properties={[
        { id: 'total', label: `Total balance · ${n(active.length, 'wallet')}`, display: amount(v.totals.total), sub: largest ? `${largest.name} ${amount(largest.balance)} is the largest` : 'across all wallets' },
        { id: 'savings', label: `In savings · ${n(savingsCount, 'wallet')}`, display: amount(v.totals.inSavings), sub: 'Set aside in savings wallets' },
        { id: 'committed', label: 'Committed this month', display: amount(v.totals.committed), sub: 'Unpaid lines paid from wallets' },
        { id: 'free', label: 'Free after commitments', tone: v.freeTotalTone, display: amount(v.totals.free), sub: 'What is left once this month is paid' },
      ]}
    >
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && (
        <section className={styles.panel} aria-label="Your wallets">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Your wallets</h2>
            {archived.length > 0 && (
              <button type="button" className={styles.textButton} aria-pressed={showArchived} onClick={() => setShowArchived((s) => !s)}>
                {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
              </button>
            )}
          </div>
          <div className={styles.cards}>
            {active.map(card)}
            <button type="button" className={styles.addWallet} onClick={() => v.openAddWallet()}>
              <Plus size={20} strokeWidth={2} aria-hidden />
              Add wallet
            </button>
            {showArchived && archived.map(card)}
          </div>
          {active.length === 0 && <p className={styles.empty}>No wallets yet. Add the first one to start tracking.</p>}
        </section>
      )}
      {v.addOpen && <AddWalletSheet v={v} />}
    </NotionPage>
  );
}
