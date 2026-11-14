'use client';

// A wallet's page on tablet and web (Dreda.figcraft `Wallet detail / Web`),
// one page, no tabs: the title row (Count this wallet and Check the balance
// beside the main action), four tiles (balance, committed this month, free
// after commitments, share of your money), the untracked alert when checks
// found money missing, balance over time, what the wallet pays for and where
// its money comes from, the upcoming payments (or the all clear), every
// transaction and transfer, then Balance checks: each count against what
// Dreda had, with Open the audit. The audit keeps its own page. Edit wallet
// is in the top bar's "..." menu.

import Link from 'next/link';
import { Check, History } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLogic } from '@/src/logic/walletDetail/useLogic';
import { useWalletHistory } from '@/src/logic/walletDetail/useHistory';
import { HistoryView } from '@/src/screens/Planning/HistoryView';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { Block, NotionPage } from '@/src/widgets/Database/NotionPage';
import { TopBarActions } from '@/src/widgets/AppShell/TopBarSlot';
import { formatNumber } from '@/src/widgets/Database/format';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './WalletDetailScreen.module.css';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const longDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
const pct = (x: number) => `${Math.round(x * 100)}%`;

const BAR: Record<string, string> = {
  transfer: 'var(--color-money-transfer-fg)',
  expense: 'var(--color-money-expense-fg)',
  income: 'var(--color-money-income-fg)',
  other: 'var(--color-text-tertiary)',
};

export function WalletDetailScreen({ walletId }: { walletId: string }) {
  const formLink = useFormLink();
  const v = useLogic(walletId);
  const h = useWalletHistory(walletId);
  const [hidden, setHidden] = useAmountsHidden();
  const auditHref = `/wallets/${encodeURIComponent(walletId)}/audit`;
  const num = (n: number) => (hidden ? HIDDEN_AMOUNT : formatNumber(n));
  const money = (n: number) => (hidden ? HIDDEN_AMOUNT : `${formatNumber(n)} ${v.currency}`);
  const name = v.wallet?.name ?? 'Wallet';
  const span = `the last ${v.historyMonths} months`;

  return (
    <NotionPage
      title={name}
      kind={v.wallet?.type}
      sub={v.lastReconciled ? `Balance last checked against the real wallet on ${day(v.lastReconciled)}` : 'Balance not yet checked against the real wallet'}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Wallets', href: '/wallets' }, { label: name }]}
      menu={[
        { label: 'Edit wallet', href: formLink('wallet', { id: walletId }) },
        { label: 'Audit this wallet', href: auditHref },
        { label: 'Reconcile', href: '/settings/reconcile' },
        { label: hidden ? 'Show amounts' : 'Hide amounts', onSelect: () => setHidden(!hidden) },
      ]}
    >
      <TopBarActions>
        <Link href={auditHref} className={styles.secondary} title="Enter what is really in this wallet">
          Count this wallet
        </Link>
        <Link href="/settings/reconcile" className={styles.secondary} title="Enter what is really in every wallet and see whether it matches Dreda">
          Check the balance
        </Link>
      </TopBarActions>
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && v.wallet && (
        <div className={styles.blocks}>
          <div className={styles.tiles}>
            <Tile label="Balance" value={num(v.balance)} sub={v.lastReconciled ? `checked on ${day(v.lastReconciled)}` : v.lockedAmount > 0 ? `${num(v.availableAmount)} available` : 'balance not checked yet'} />
            <Tile label="Committed this month" value={num(v.committed)} sub={v.upcomingLines.length ? `${v.upcomingLines.length} ${v.upcomingLines.length === 1 ? 'payment' : 'payments'} still to go` : 'nothing left to pay'} />
            <Tile label="Free after commitments" value={num(v.free)} sub="what you can spend from here" tone={v.free < 0 ? 'danger' : 'brand'} />
            <Tile
              label="Share of your money"
              value={v.share ? pct(v.share.fraction) : '–'}
              sub={v.share ? `of ${num(v.share.total)} across ${v.share.wallets} ${v.share.wallets === 1 ? 'wallet' : 'wallets'}` : 'no wallets with money yet'}
            />
          </div>

          {v.untracked && (
            <section className={styles.alert} role="status">
              <span className={styles.alertIcon} aria-hidden>
                <History size={20} strokeWidth={1.75} />
              </span>
              <div className={styles.alertCopy}>
                <p className={styles.alertTitle}>{num(v.untracked.amount)} left this wallet this year with no record</p>
                <p className={styles.alertText}>
                  That is {pct(v.untracked.share)} of everything untracked this year.
                  {v.untracked.latestAt && v.untracked.latestMatched
                    ? ` The balance check on ${day(v.untracked.latestAt)} matched, so the gap sits in the months before it.`
                    : v.untracked.latestAt
                      ? ` The balance check on ${day(v.untracked.latestAt)} did not match either.`
                      : ''}
                </p>
              </div>
              <Link href={auditHref} className={styles.secondary}>
                Show those months
              </Link>
            </section>
          )}

              <Block title="Balance over time">
                <p className={styles.blockSub}>{v.historyMonths} months, the balance at the end of each</p>
                <div className={styles.chart} role="img" aria-label={`Balance at each month end: ${v.balanceByMonth.map((p) => `${p.label} ${formatNumber(p.balance)}`).join(', ')}`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={v.balanceByMonth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={styleGuide.data.grid} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={64} tickFormatter={(n: number) => (hidden ? '' : formatNumber(n))} />
                      <Tooltip formatter={(n) => money(Number(n))} />
                      <Area type="monotone" dataKey="balance" name="Balance" stroke={styleGuide.brand.primary} fill={styleGuide.brand.primaryLight} strokeWidth={2} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Block>

              <div className={styles.usage}>
                <UsageCard
                  title="What this wallet pays for"
                  sub={`${num(v.usage.out.total)} out in ${span}`}
                  rows={v.usage.out.rows}
                  num={num}
                  empty="Nothing has left this wallet yet."
                  note={v.usage.out.rows[0]?.kind === 'transfer' ? 'Most of what leaves this wallet is a transfer to another wallet, not a purchase.' : null}
                />
                <UsageCard
                  title="Where its money comes from"
                  sub={`${num(v.usage.into.total)} in over ${span}`}
                  rows={v.usage.into.rows}
                  num={num}
                  empty="Nothing has come into this wallet yet."
                  note={v.usage.into.rows[0] && v.share && v.usage.into.rows[0].kind === 'income' ? `${v.usage.into.rows[0].label} lands here first, which is why this wallet holds ${pct(v.share.fraction)} of your money.` : null}
                />
              </div>

              {v.upcomingLines.length ? (
                <Block title="Upcoming payments from this wallet">
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
                </Block>
              ) : (
                <section className={styles.clear}>
                  <span className={styles.clearIcon} aria-hidden>
                    <Check size={20} strokeWidth={2} />
                  </span>
                  <div className={styles.alertCopy}>
                    <p className={styles.clearTitle}>Nothing left to pay from {name} this month</p>
                    <p className={styles.alertText}>
                      {v.nextDue ? `The next one due here is ${v.nextDue.name} on ${longDay(v.nextDue.due)}, ${num(v.nextDue.amount)}.` : 'Nothing else is planned from this wallet yet.'}
                    </p>
                  </div>
                  <Link href="/payments" className={styles.secondary}>
                    See the queue
                  </Link>
                </section>
              )}

            <Block title="Transactions">
              <ScreenState loading={h.loading} error={h.error ? String(h.error) : null} />
              {!h.loading && !h.error && (
                <>
                  <HistoryView rows={h.rows} currency={h.currency} fields={h.fields} list={h.list} stickyTop="0px" emptyText={`No transactions in ${name} yet.`} showYear />
                  {h.capped && <p className={styles.empty}>Showing the latest transactions. Filter by date to find earlier ones.</p>}
                </>
              )}
            </Block>

            <BalanceChecks checks={v.checks} num={num} auditHref={auditHref} />
        </div>
      )}
    </NotionPage>
  );
}

const CHECK_WORD = { matched: 'Matched', explained: 'Explained', short: 'Short', over: 'Over' } as const;

/** Each count of this wallet against what Dreda had (replaces the Audit tab). */
function BalanceChecks({ checks, num, auditHref }: { checks: ReturnType<typeof useLogic>['checks']; num: (n: number) => string; auditHref: string }) {
  return (
    <section className={styles.checks} aria-label="Balance checks">
      <header className={styles.checksHead}>
        <h2 className={styles.checksTitle}>Balance checks</h2>
        <Link href={auditHref} className={styles.checksLink}>
          Open the audit
        </Link>
      </header>
      <p className={styles.checksHelp}>What you counted in this wallet, against what Dreda had.</p>
      {checks.length ? (
        <ul className={styles.checkList}>
          {checks.map((c) => (
            <li key={c.id} className={styles.check} data-status={c.status === 'matched' ? 'success' : 'warning'}>
              <span className={styles.checkDate}>{day(c.at)}</span>
              <span className={styles.checkText}>
                {c.status === 'matched'
                  ? `Counted ${num(c.counted)} and it matched Dreda`
                  : `Counted ${num(c.counted)}, which was ${num(Math.abs(c.gap))} ${c.gap < 0 ? 'short' : 'over'}`}
              </span>
              <span className={styles.checkStatus}>{CHECK_WORD[c.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.checksHelp}>This wallet hasn&apos;t been counted yet.</p>
      )}
      <p className={styles.checksFoot}>Counting a wallet tells Dreda what is really in it, so the gap can be explained month by month.</p>
    </section>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'brand' | 'danger' }) {
  return (
    <div className={styles.tile} data-tone={tone}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileSub}>{sub}</span>
    </div>
  );
}

function UsageCard({
  title,
  sub,
  rows,
  num,
  empty,
  note,
}: {
  title: string;
  sub: string;
  rows: { label: string; amount: number; share: number; kind: string }[];
  num: (n: number) => string;
  empty: string;
  note: string | null;
}) {
  return (
    <section className={styles.usageCard} aria-label={title}>
      <h2 className={styles.usageTitle}>{title}</h2>
      <p className={styles.blockSub}>{sub}</p>
      {rows.length ? (
        <ul className={styles.usageRows}>
          {rows.map((r) => (
            <li key={r.label}>
              <span className={styles.usageLabel}>{r.label}</span>
              <span className={styles.usageAmount}>{num(r.amount)}</span>
              <span className={styles.track} aria-hidden>
                <span className={styles.fill} style={{ width: `${Math.max(2, r.share * 100)}%`, background: BAR[r.kind] ?? BAR.other }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
      {note && <p className={styles.usageNote}>{note}</p>}
    </section>
  );
}
