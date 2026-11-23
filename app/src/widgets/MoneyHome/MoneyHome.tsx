'use client';

// The Money dashboard's sections (Dreda.figcraft `Dashboard / Web` and
// `Dashboard / Phone`), shared by the web and phone Home screens: the
// balance card, the four tiles, the wallet cards, cash flow, spending,
// income, the budget, recent activity and upcoming bills. Data comes from
// src/logic/home; the screens only arrange these.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  History,
  ShoppingBasket,
  HandCoins,
  Clock,
  PiggyBank,
  Plus,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { HomeLogic, HomeTx } from '@/src/logic/home/useLogic';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { formatMoney } from '@/src/widgets/Money/Money';
import { WalletCard, type WalletTone } from '@/src/widgets/Money/WalletCard';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { UNJUSTIFIED_WALLET_ID } from '@/src/shared/firestore/refs';
import styles from './MoneyHome.module.css';

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const DONUT = [1, 2, 3, 4, 5].map((n) => `var(--color-data-categorical-${n})`);
const OTHERS = 'var(--color-border-default)';

const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;
const share = (part: number, whole: number) => (whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0);

/* ---------- Shared pieces ---------- */

export function CardHead({ title, sub, href, children }: { title: string; sub?: ReactNode; href?: string; children?: ReactNode }) {
  return (
    <div className={styles.cardHead}>
      <div className={styles.cardTitles}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {sub && <p className={styles.cardSub}>{sub}</p>}
      </div>
      {children}
      {href && (
        <Link href={href} className={styles.linkButton} aria-label={`Open ${title}`}>
          <ArrowUpRight size={16} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

export function Spark({ values, tone = 'brand' }: { values: number[]; tone?: 'brand' | 'out' }) {
  const max = Math.max(...values, 0);
  if (max <= 0) return null;
  return (
    <span className={styles.spark} data-tone={tone} aria-hidden>
      {values.map((n, i) => (
        <span key={i} data-now={i === values.length - 1 || undefined} style={{ height: `${Math.max(4, Math.round((n / max) * 26))}px` }} />
      ))}
    </span>
  );
}

/* ---------- 1. Overview ---------- */

export function BalanceCard({ v }: { v: HomeLogic }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const safe = v.guide?.today.left ?? null;
  return (
    <div className={styles.balance}>
      <span className={styles.balanceDecor} aria-hidden />
      <div className={styles.balanceTop}>
        <span className={styles.balanceLabel}>Total balance</span>
        <button type="button" className={styles.currency} onClick={(e) => setMenu(e.currentTarget)} aria-haspopup="menu">
          {v.currency}
          <ChevronDown size={14} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <p className={styles.balanceAmount}>
        <span>{formatMoney(v.cash)}</span>
        <span className={styles.balanceUnit}>{v.currency}</span>
      </p>
      <div className={styles.balanceStats}>
        <div className={styles.balanceStat}>
          <span>Spendable</span>
          <strong>{formatMoney(v.spendable)}</strong>
        </div>
        <div className={styles.balanceStat}>
          <span>Savings</span>
          <strong>{formatMoney(v.savings)}</strong>
        </div>
      </div>
      {Math.abs(v.unexplained) >= 0.5 && (
        <Link href={`/wallets/${UNJUSTIFIED_WALLET_ID}`} className={styles.unaccounted}>
          <span className={styles.warnDot} aria-hidden />
          <span className={styles.unaccountedLabel}>Unaccounted for in {v.unexplainedMonth}</span>
          <span className={styles.unaccountedValue}>
            {formatMoney(v.unexplained)} {v.currency}
          </span>
          <span className={styles.review}>Review</span>
        </Link>
      )}
      {safe !== null && (
        <Link href="/budget" className={styles.safe}>
          <span>Safe to spend today</span>
          <strong>
            {formatMoney(Math.max(0, safe))} {v.currency}
          </strong>
        </Link>
      )}
      {menu && (
        <Popover anchor={menu} label="Display currency" onClose={() => setMenu(null)}>
          <div className={styles.menu} role="menu">
            {v.currencyOptions.map((o) => (
              <button
                key={o.code}
                type="button"
                role="menuitemradio"
                aria-checked={o.code === v.currency}
                className={styles.menuRow}
                onClick={() => {
                  void v.switchCurrency(o.code);
                  setMenu(null);
                }}
              >
                <strong>{o.code}</strong> {o.name}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

function change(n: number | null, last: string, upIsGood: boolean) {
  if (n === null) return { text: `Nothing to compare with ${last} yet`, tone: 'muted' as const };
  const good = upIsGood ? n >= 0 : n <= 0;
  return { text: `${n >= 0 ? '+' : '-'}${pct(n)} on ${last}`, tone: good ? ('good' as const) : ('bad' as const) };
}

export function Kpis({ v }: { v: HomeLogic }) {
  const last = MONTH.format(new Date(v.now.getFullYear(), v.now.getMonth() - 1, 1));
  const inChange = change(v.income.change, last, true);
  const outChange = change(v.spending.change, last, false);
  const savedShare = v.received > 0 ? `${pct(v.saved.amount / v.received)} of income` : 'Nothing received yet';
  return (
    <div className={styles.kpis}>
      <Kpi icon={<ArrowDownLeft size={20} strokeWidth={2} />} tone="income" label="Money in" href="/transactions?type=Income" value={v.received} note={inChange.text} noteTone={inChange.tone} spark={<Spark values={v.sparks.income} />} />
      <Kpi icon={<ArrowUpRight size={20} strokeWidth={2} />} tone="expense" label="Money out" href="/transactions?type=Expense" value={v.spending.spent} note={outChange.text} noteTone={outChange.tone} spark={<Spark values={v.sparks.expense} />} />
      <Kpi
        icon={<ArrowLeftRight size={20} strokeWidth={2} />}
        tone="transfer"
        label="Transfers"
        href="/transactions?type=Transfer"
        value={v.transfers.moved}
        note={v.transfers.planned > 0 ? `of ${formatMoney(v.transfers.planned)} planned` : 'Moves between wallets'}
        noteTone="muted"
      />
      <Kpi icon={<PiggyBank size={20} strokeWidth={2} />} tone="savings" label="Saved this month" href="/baskets?type=Savings" value={v.saved.amount} note={savedShare} noteTone="muted" spark={<Spark values={v.sparks.savings} />} />
    </div>
  );
}

export function Kpi({
  icon,
  tone,
  label,
  href,
  value,
  note,
  noteTone,
  spark,
}: {
  icon: ReactNode;
  tone: 'income' | 'expense' | 'transfer' | 'savings';
  label: string;
  href: string;
  value: number;
  note: string;
  noteTone: 'good' | 'bad' | 'muted';
  spark?: ReactNode;
}) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiIcon} data-tone={tone} aria-hidden>
          {icon}
        </span>
        <span className={styles.kpiLabel}>{label}</span>
        <Link href={href} className={styles.linkButton} aria-label={`Open ${label}`}>
          <ArrowUpRight size={16} strokeWidth={2} />
        </Link>
      </div>
      <p className={styles.kpiValue}>{formatMoney(value)}</p>
      <div className={styles.kpiBottom}>
        <span className={styles.kpiNote} data-tone={noteTone}>
          {note}
        </span>
        {spark}
      </div>
    </div>
  );
}

/* ---------- 2. Wallets ---------- */

const CYCLE: WalletTone[] = ['purple', 'ink', 'lilac'];

export function Wallets({ v }: { v: HomeLogic }) {
  const formLink = useFormLink();
  let plain = 0;
  return (
    <section className={styles.card} aria-label="Wallets">
      <CardHead title="Wallets" href="/wallets" />
      <div className={styles.walletRow}>
        {v.accountRows.map((a) => {
          const tone: WalletTone = a.savings ? 'lime' : CYCLE[plain++ % CYCLE.length];
          return (
            <Link key={a.id} href={`/wallets/${a.id}`} className={styles.walletLink} aria-label={`${a.name}, ${formatMoney(a.balance)} ${v.currency}`}>
              <WalletCard
                tone={tone}
                hue={a.hue}
                type={a.type || (a.savings ? 'Savings' : 'Wallet')}
                name={a.name}
                last4={a.code}
                currency={v.currency}
                available={formatMoney(a.balance)}
                required={a.committed > 0.5 ? formatMoney(a.committed) : '*****'}
              />
            </Link>
          );
        })}
        <Link href={formLink('wallet')} scroll={false} className={styles.addWallet}>
          <Plus size={20} strokeWidth={2} aria-hidden />
          Add wallet
        </Link>
      </div>
    </section>
  );
}

/* ---------- 3. Cash flow and Spending ---------- */

export function CashFlow({ v }: { v: HomeLogic }) {
  const title = v.flowView === 'week' ? 'Cash flow, last 30 days' : 'Cash flow, last 6 months';
  return (
    <section className={styles.card} aria-label={title}>
      <CardHead title={title} href="/statistics/breakdown">
        <div className={styles.segmented} role="group" aria-label="Group by">
          {(['week', 'month'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={v.flowView === k} onClick={() => v.setFlowView(k)}>
              {k === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </CardHead>
      <div className={styles.flowChart}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={v.flow} barGap={4} barCategoryGap="22%" margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--color-text-tertiary)' }} />
            <Tooltip
              cursor={{ fill: 'var(--color-bg-sunken)' }}
              formatter={(value, name) => [formatMoney(Number(value)), name === 'income' ? 'Income' : 'Expenses']}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border-default)', fontSize: 12 }}
            />
            <Bar dataKey="income" fill="var(--color-brand-default)" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Bar dataKey="expense" fill="var(--color-card-lilac-decor)" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend}>
        <span>
          <i style={{ background: 'var(--color-brand-default)' }} /> Income
        </span>
        <span>
          <i style={{ background: 'var(--color-card-lilac-decor)' }} /> Expenses
        </span>
        <span className={styles.legendHint}>Hover a pair to see the net for that {v.flowView}</span>
      </div>
    </section>
  );
}

export function Spending({ v, variant = 'donut' }: { v: HomeLogic; variant?: 'donut' | 'bar' }) {
  const s = v.spending;
  const rows = [...s.top.map((t, i) => ({ key: t.id, name: t.name, amount: t.amount, color: DONUT[i] })), ...(s.others > 0.5 ? [{ key: 'others', name: 'Everything else', amount: s.others, color: OTHERS }] : [])];
  const month = MONTH.format(v.now);
  const last = MONTH.format(new Date(v.now.getFullYear(), v.now.getMonth() - 1, 1));
  const diff = s.last - s.spent;
  const trend =
    s.change === null
      ? null
      : `${s.change <= 0 ? 'Down' : 'Up'} ${pct(s.change)} on ${last}, about ${formatMoney(Math.abs(diff))} ${diff >= 0 ? 'less' : 'more'} so far.`;
  return (
    <section className={styles.card} aria-label="Spending">
      <CardHead title={variant === 'bar' ? 'Where your money went' : 'Spending'} sub={variant === 'bar' ? `Top ${rows.length} categories this month` : `${month}, against your budget`} href="/statistics" />
      {variant === 'bar' ? (
        <>
          <p className={styles.incomeLine}>
            <strong>
              {formatMoney(s.spent)} {v.currency}
            </strong>
            <span>spent so far</span>
          </p>
          <span className={styles.stackBar} aria-hidden>
            {rows.map((r) => (
              <span key={r.key} style={{ flexGrow: r.amount, background: r.color }} />
            ))}
          </span>
        </>
      ) : (
      <div className={styles.donut}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows.length ? rows : [{ key: 'none', amount: 1, color: OTHERS }]} dataKey="amount" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="var(--color-bg-surface)" strokeWidth={3} isAnimationActive={false}>
              {(rows.length ? rows : [{ key: 'none', color: OTHERS }]).map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.donutCenter}>
          <strong>{formatMoney(s.spent)}</strong>
          {s.planned > 0 && (
            <>
              <span>of {formatMoney(s.planned)}</span>
              <em>{pct(share(s.spent, s.planned))} of budget</em>
            </>
          )}
        </div>
      </div>
      )}
      {variant === 'donut' && trend && <p className={styles.bodyText}>{trend}</p>}
      {variant === 'donut' && s.insight && (
        <p className={styles.insightChip}>
          {s.change !== null && s.change > 0 ? <TrendingUp size={16} strokeWidth={2} aria-hidden /> : <TrendingDown size={16} strokeWidth={2} aria-hidden />}
          {s.insight}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p className={styles.overline}>Where it went</p>
          <ul className={styles.whereList}>
            {rows.map((r) => (
              <li key={r.key}>
                <i style={{ background: r.color }} aria-hidden />
                <span className={styles.whereName}>{r.name}</span>
                <span className={styles.wherePct}>{pct(share(r.amount, s.spent))}</span>
                <span className={styles.whereAmount}>{formatMoney(r.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------- 4. Income and Budget ---------- */

export function Income({ v }: { v: HomeLogic }) {
  const inc = v.income;
  const month = MONTH.format(v.now);
  const last = MONTH.format(new Date(v.now.getFullYear(), v.now.getMonth() - 1, 1));
  const got = share(inc.received, inc.expected);
  return (
    <section className={styles.card} aria-label="Income">
      <CardHead title="Income" sub={`${month}, received against expected`} href="/transactions?type=Income" />
      <p className={styles.incomeLine}>
        <strong>{formatMoney(inc.received)}</strong>
        {inc.expected > 0 && (
          <span>
            received of {formatMoney(inc.expected)} expected · {pct(got)}
          </span>
        )}
      </p>
      {inc.expected > 0 && <Meter value={got} />}
      {inc.change !== null && (
        <p className={styles.bodyText}>
          {inc.change >= 0 ? 'Up' : 'Down'} {pct(inc.change)} on {last} at this point in the month.
        </p>
      )}
      {v.stillExpected > 0.5 && (
        <p className={styles.expectChip}>
          <Clock size={16} strokeWidth={2} aria-hidden />
          {v.stillExpectedNames.length === 1 ? `${v.stillExpectedNames[0]} of ${formatMoney(v.stillExpected)} still expected` : `${formatMoney(v.stillExpected)} still expected from ${v.stillExpectedNames.length} sources`}
        </p>
      )}
      <p className={styles.overline}>By source</p>
      <ul className={styles.sourceList}>
        {inc.sources
          .filter((src) => src.expected > 0.5 || src.received > 0.5)
          .map((src) => (
            <li key={src.id}>
              <div className={styles.sourceHead}>
                <span className={styles.sourceName}>{src.label}</span>
                <span className={styles.pctChip}>{pct(share(src.received, src.expected))}</span>
                <span className={styles.sourceFigures}>
                  {formatMoney(src.received)} / {formatMoney(src.expected)}
                </span>
              </div>
              <Meter value={share(src.received, src.expected)} />
            </li>
          ))}
      </ul>
    </section>
  );
}

export function Budget({ v }: { v: HomeLogic }) {
  const month = MONTH.format(v.now);
  const used = share(v.spending.spent, v.spending.planned);
  return (
    <section className={styles.card} aria-label={`${month} budget`}>
      <CardHead title={`${month} budget`} sub={`${pct(used)} used · ${v.daysLeft} ${v.daysLeft === 1 ? 'day' : 'days'} left`} href="/budget" />
      {v.budgetLines.length === 0 ? (
        <p className={styles.bodyText}>No spending planned for {month} yet.</p>
      ) : (
        <ul className={styles.budgetList}>
          {v.budgetLines.map((l) => {
            const over = l.spent - l.planned;
            const ratio = share(l.spent, l.planned);
            const tone = over > 0.5 ? 'danger' : ratio >= 0.7 ? 'warning' : 'success';
            return (
              <li key={l.id}>
                <div className={styles.budgetHead}>
                  <span>{l.name}</span>
                  {over > 0.5 ? (
                    <span className={styles.over}>Over by {formatMoney(over)}</span>
                  ) : (
                    <span className={styles.sourceFigures}>
                      {formatMoney(l.spent)} / {formatMoney(l.planned)}
                    </span>
                  )}
                </div>
                <Meter value={over > 0.5 ? Math.min(1, l.planned / l.spent) : ratio} tone={tone} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Meter({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'success' | 'warning' | 'danger' }) {
  return (
    <span className={styles.meter} aria-hidden>
      <span data-tone={tone} style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

/* ---------- 5. Activity ---------- */

const TX_ICON: Record<HomeTx['kind'], ReactNode> = {
  expense: <ArrowUpRight size={20} strokeWidth={2} />,
  income: <ArrowDownLeft size={20} strokeWidth={2} />,
  transfer: <ArrowLeftRight size={20} strokeWidth={2} />,
  savings: <ArrowDownToLine size={20} strokeWidth={2} />,
};

function whenText(d: Date, now: Date) {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today, ${TIME.format(d)}`;
  if (diff === 1) return 'Yesterday';
  return DAY_MONTH.format(d);
}

export function Recent({ items }: { items: HomeTx[] }) {
  const [now] = useState(() => new Date());
  return (
    <section className={`${styles.card} ${styles.recent}`} aria-label="Recent activity">
      <CardHead title="Recent activity" href="/transactions" />
      {items.length === 0 ? (
        <p className={styles.bodyText}>Nothing recorded yet.</p>
      ) : (
        <ul className={styles.txList}>
          {items.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className={styles.txRow}>
                <span className={styles.txIcon} data-kind={t.kind} aria-hidden>
                  {TX_ICON[t.kind]}
                </span>
                <span className={styles.txText}>
                  <span className={styles.txName}>{t.name}</span>
                  <span className={styles.txSub}>{t.sub}</span>
                </span>
                <span className={styles.txRight}>
                  <span className={styles.txAmount} data-kind={t.kind}>
                    {t.kind === 'income' || t.kind === 'savings' ? '+' : t.amount < 0 ? '-' : ''}
                    {formatMoney(Math.abs(t.amount))}
                  </span>
                  <span className={styles.txWhen}>{whenText(t.when, now)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Bills({ v }: { v: HomeLogic }) {
  const bills = v.upcoming.slice(0, 3);
  return (
    <section className={`${styles.card} ${styles.bills}`} aria-label="Upcoming bills">
      <CardHead title="Upcoming bills" href="/payments" />
      {bills.length === 0 ? (
        <p className={styles.bodyText}>Nothing left to pay this month.</p>
      ) : (
        <ul className={styles.billList}>
          {bills.map((b) => (
            <li key={b.key}>
              <Link href={b.href} className={styles.billRow}>
                <span className={styles.billIcon} aria-hidden>
                  <ReceiptText size={20} strokeWidth={2} />
                </span>
                <span className={styles.txText}>
                  <span className={styles.txName}>{b.name}</span>
                  <span className={styles.txSub} data-late={b.late || undefined}>
                    {b.due} · {b.bucket}
                  </span>
                </span>
                <span className={styles.billAmount}>{formatMoney(b.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Phone only (Dreda.figcraft `Dashboard / Phone`) ---------- */

export function QuickActions() {
  const formLink = useFormLink();
  const items = [
    { href: formLink('transaction'), label: 'Add', icon: <Plus size={22} strokeWidth={2} /> },
    { href: '/transactions', label: 'History', icon: <History size={22} strokeWidth={2} /> },
    { href: '/baskets', label: 'Baskets', icon: <ShoppingBasket size={22} strokeWidth={2} /> },
    { href: '/debts', label: 'Debts', icon: <HandCoins size={22} strokeWidth={2} /> },
  ];
  return (
    <nav className={styles.quick} aria-label="Quick actions">
      {items.map((i) => (
        <Link key={i.label} href={i.href} scroll={false} className={styles.quickItem}>
          <span className={styles.quickIcon} aria-hidden>
            {i.icon}
          </span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Money in and out over the chosen range, two figures over the bars. */
export function MoneyInOut({ v }: { v: HomeLogic }) {
  const income = v.flow.reduce((sum, b) => sum + b.income, 0);
  const expense = v.flow.reduce((sum, b) => sum + b.expense, 0);
  return (
    <section className={styles.card} aria-label="Money in and out">
      <CardHead title="Money in and out" href="/statistics/breakdown">
        <div className={styles.segmented} role="group" aria-label="Group by">
          {(['week', 'month'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={v.flowView === k} onClick={() => v.setFlowView(k)}>
              {k === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </CardHead>
      <div className={styles.inOut}>
        <div>
          <span>
            Money in <i style={{ background: 'var(--color-brand-default)' }} />
          </span>
          <strong>+{formatMoney(income)}</strong>
        </div>
        <div>
          <span>
            Money out <i style={{ background: 'var(--color-card-lilac-decor)' }} />
          </span>
          <strong>-{formatMoney(expense)}</strong>
        </div>
      </div>
      <div className={styles.flowChartSmall}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={v.flow} barGap={3} barCategoryGap="28%" margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} />
            <Bar dataKey="income" fill="var(--color-brand-default)" radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expense" fill="var(--color-card-lilac-decor)" radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
