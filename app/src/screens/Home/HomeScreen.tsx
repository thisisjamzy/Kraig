'use client';

// Money Home, after the dashboard reference, in Dreda's colors.
//   Header: "Good afternoon, James", the date and days left in the month,
//   and four property tiles (Received this month, Still expected,
//   Spendable now, Ready to pay).
//   Row 1: the balance block (two thirds; account chips, cash in accounts,
//   savings and spendable, Add transaction, Transfer, "...", the eye that
//   hides every amount) and the lime Ready to pay block (one third; or
//   "Spend today" when nothing is waiting).
//   Row 2: Spending (ring against the plan, one insight, top 4 expense
//   categories), Income (received against expected, by source),
//   Transactions (up to 2 waiting for confirmation, then the 4 latest).
//   Row 3, staggered: Upcoming payments (never income), Accounts, Cash
//   flow, This month's plan, Debt.
//   Medium: row 1 stacked; Spending and Income side by side, Transactions
//   below; row 3 in two columns. Phones: one block per row, Transactions
//   right after Ready to pay.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  HandCoins,
  MoreHorizontal,
  PiggyBank,
  ReceiptText,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useLogic, type HomeLogic, type HomeTx } from '@/src/logic/home/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { setAmountsHidden, useAmountsHidden, HIDDEN_AMOUNT } from '@/src/shared/hooks/usePrivacy';
import { unexplainedText } from '@/src/viewmodels/home';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { Money, formatMoney } from '@/src/widgets/Money/Money';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './HomeScreen.module.css';

const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;

export function HomeScreen() {
  const v = useLogic();
  const { deviceClass } = useLayout();
  const [hidden] = useAmountsHidden();
  const compact = deviceClass === 'compact';
  const medium = deviceClass === 'medium';
  const c = v.currency;
  const dateLine = `${v.now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · ${v.daysLeft} ${v.daysLeft === 1 ? 'day' : 'days'} left in ${v.now.toLocaleDateString('en-GB', { month: 'long' })}`;

  const balance = <BalanceBlock v={v} />;
  const ready = <ReadyBlock v={v} />;
  const spending = <SpendingBlock v={v} />;
  const income = <IncomeBlock v={v} />;
  const transactions = <TransactionsBlock v={v} />;
  const supporting = [
    <UpcomingBlock key="upcoming" v={v} />,
    <AccountsBlock key="accounts" v={v} />,
    <CashFlowBlock key="flow" v={v} />,
    <PlanBlock key="plan" v={v} />,
    <DebtBlock key="debt" v={v} />,
  ];
  const cols = deviceClass === 'large' ? 3 : compact ? 1 : 2;
  const stacks = Array.from({ length: cols }, (_, i) => supporting.filter((_, j) => j % cols === i));

  return (
    <NotionPage
      title={v.greeting}
      sub={dateLine}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Home', href: '/home' }]}
      menu={[
        { label: 'Add transaction', href: '/add-transaction' },
        { label: hidden ? 'Show amounts' : 'Hide amounts', onSelect: () => setAmountsHidden(!hidden) },
      ]}
      properties={[
        { id: 'received', label: 'Received this month', tone: 'in', display: <Money value={v.received} />, sub: <>of <Money value={v.expected} /> expected</> },
        {
          id: 'expected',
          label: 'Still expected',
          display: <Money value={v.stillExpected} />,
          sub: v.stillExpectedNames.length ? v.stillExpectedNames.slice(0, 2).join(', ') + (v.stillExpectedNames.length > 2 ? ` and ${v.stillExpectedNames.length - 2} more` : '') : 'Nothing else expected',
          title: v.stillExpectedNames.join(', '),
        },
        { id: 'spendable', label: 'Spendable now', tone: v.allSpendable < 0 ? 'bad' : 'good', display: <Money value={v.allSpendable} /> },
        v.ready.count
          ? { id: 'ready', label: 'Ready to pay', tone: 'watch', display: `${v.ready.count} ready`, sub: <Money value={v.ready.total} currency={c} /> }
          : { id: 'ready', label: 'Ready to pay', display: 'Nothing waiting' },
      ]}
    >
      {v.loading ? (
        <ScreenState loading />
      ) : compact ? (
        <div className={styles.stack}>
          {balance}
          {ready}
          {transactions}
          {spending}
          {income}
          {supporting}
        </div>
      ) : (
        <div className={styles.dash}>
          <div className={styles.row1} data-stacked={medium || undefined}>
            {balance}
            {ready}
          </div>
          {medium ? (
            <>
              <div className={styles.row2} data-cols="2">
                {spending}
                {income}
              </div>
              {transactions}
            </>
          ) : (
            <div className={styles.row2}>
              {spending}
              {income}
              {transactions}
            </div>
          )}
          <div className={styles.row3} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {stacks.map((s, i) => (
              <div key={i} className={styles.stackCol}>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}
    </NotionPage>
  );
}


function BlockHead({ icon, title, right }: { icon: ReactNode; title: string; right?: ReactNode }) {
  return (
    <header className={styles.blockHead}>
      <span className={styles.blockIcon} aria-hidden>
        {icon}
      </span>
      <h2 className={styles.blockTitle}>{title}</h2>
      {right && <span className={styles.blockRight}>{right}</span>}
    </header>
  );
}

// ---- Row 1 ----

function BalanceBlock({ v }: { v: HomeLogic }) {
  const [hidden, setHidden] = useAmountsHidden();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [currencyMenu, setCurrencyMenu] = useState<HTMLElement | null>(null);
  const gap = unexplainedText(v.unexplained, (n) => (hidden ? HIDDEN_AMOUNT : formatMoney(n)));
  return (
    <section className={styles.balance} aria-label="Cash in accounts">
      <div className={styles.chipRow}>
        <div className={styles.chips} role="radiogroup" aria-label="Accounts">
          <button type="button" role="radio" aria-checked={v.accountFilter === 'all'} className={styles.chip} onClick={() => v.setAccountFilter('all')}>
            All accounts
          </button>
          {v.accounts.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={v.accountFilter === a.id} className={styles.chip} onClick={() => v.setAccountFilter(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
        <button type="button" className={styles.currencyChip} onClick={(e) => setCurrencyMenu(e.currentTarget)} aria-label={`Currency ${v.currency}, change`}>
          {v.currency}
        </button>
        <button type="button" className={styles.eye} aria-pressed={hidden} onClick={() => setHidden(!hidden)} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} title={hidden ? 'Show amounts' : 'Hide amounts'}>
          {hidden ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
        </button>
      </div>
      <p className={styles.balanceLabel}>Cash in accounts</p>
      <p className={styles.balanceValue}>
        <Money value={v.cash} />
        <span className={styles.balanceUnit}>{v.currency}</span>
      </p>
      <p className={styles.balanceSub}>
        Savings <Money value={v.savings} /> · Spendable now <Money value={v.spendable} />
      </p>
      {gap && (
        <p className={styles.gap}>
          {gap} <Link href="/settings/reconcile">Reconcile</Link>
        </p>
      )}
      <div className={styles.balanceActions}>
        <Link href="/add-transaction" className={styles.primary}>
          Add transaction
        </Link>
        <Link href="/add-transaction?type=transfer" className={styles.outline}>
          Transfer
        </Link>
        <button type="button" className={styles.outlineIcon} aria-label="More actions" onClick={(e) => setMenu(e.currentTarget)}>
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
        <Link href="/transactions" className={styles.arrow} aria-label="Open transactions">
          <ArrowUpRight size={20} strokeWidth={2} />
        </Link>
      </div>
      {menu && (
        <Popover anchor={menu} label="More actions" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            <Link href="/add-transaction?type=income" onClick={() => setMenu(null)}>
              Record income
            </Link>
            <Link href="/settings/reconcile" onClick={() => setMenu(null)}>
              Reconcile
            </Link>
          </div>
        </Popover>
      )}
      {currencyMenu && (
        <Popover anchor={currencyMenu} label="Show amounts in" onClose={() => setCurrencyMenu(null)}>
          <div className={styles.menu}>
            {v.currencyOptions.map((o) => (
              <button
                key={o.code}
                type="button"
                aria-pressed={o.code === v.currency}
                onClick={() => {
                  void v.switchCurrency(o.code);
                  setCurrencyMenu(null);
                }}
              >
                {o.code} <span className={styles.muted}>{o.name}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </section>
  );
}

function ReadyBlock({ v }: { v: HomeLogic }) {
  const c = v.currency;
  if (!v.ready.count) {
    const g = v.guide;
    return (
      <section className={styles.ready} aria-label="Spend today">
        <span className={styles.readyChip}>Spend today</span>
        {g ? (
          <>
            <p className={styles.readyValue}>
              <Money value={g.follow} currency={c} />
            </p>
            <p className={styles.readyNote}>a day for variable spending, {g.daysLeft} days left</p>
            <div className={styles.readyTiles}>
              <div>
                <span>Spent today</span>
                <strong>
                  <Money value={g.today.spent} />
                </strong>
              </div>
              <div>
                <span>Left today</span>
                <strong data-tone={g.today.left < 0 ? 'bad' : undefined}>
                  <Money value={g.today.left} />
                </strong>
              </div>
            </div>
            <Link href="/baskets/forecast" className={styles.readyButton}>
              Open plan and forecast
            </Link>
          </>
        ) : (
          <>
            <p className={styles.readyNote}>Nothing is waiting to be paid. Plan variable spending on the Budget page to see a daily allowance here.</p>
            <Link href="/budget" className={styles.readyButton}>
              Open budget
            </Link>
          </>
        )}
      </section>
    );
  }
  return (
    <section className={styles.ready} aria-label="Ready to pay">
      <span className={styles.readyChip}>
        Ready to pay <strong>{v.ready.count}</strong>
      </span>
      <p className={styles.readyValue}>
        <Money value={v.ready.total} currency={c} />
      </p>
      <div className={styles.readyTiles}>
        <div>
          <span>Can pay now</span>
          <strong>
            <Money value={v.ready.canPayNow} />
          </strong>
        </div>
        <div>
          <span>Waiting for income</span>
          <strong>
            <Money value={v.ready.waiting} />
          </strong>
          {v.ready.waitingFor && v.ready.waiting > 0 && <em>{v.ready.waitingFor}</em>}
        </div>
      </div>
      <Link href="/budget/ready" className={styles.readyButton}>
        Review and confirm
      </Link>
    </section>
  );
}

// ---- Row 2 ----

function Ring({ value, children }: { value: number; children: ReactNode }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, value));
  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 128 128" width="148" height="148" aria-hidden>
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" className={styles.ringTrack} />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - share)}
          transform="rotate(-90 64 64)"
          className={styles.ringValue}
          data-over={value > 1 || undefined}
        />
      </svg>
      <div className={styles.ringCenter}>{children}</div>
    </div>
  );
}

function SpendingBlock({ v }: { v: HomeLogic }) {
  const s = v.spending;
  const share = s.planned > 0 ? s.spent / s.planned : 0;
  return (
    <section className={styles.block} aria-label="Spending">
      <BlockHead icon={<ReceiptText size={16} strokeWidth={2} />} title="Spending" right={<span className={styles.monthChip}>{v.now.toLocaleDateString('en-GB', { month: 'long' })}</span>} />
      <Ring value={share}>
        <strong>
          <Money value={s.spent} />
        </strong>
        <span>{s.planned > 0 ? <>of <Money value={s.planned} /></> : 'No plan yet'}</span>
      </Ring>
      {s.change !== null && (
        <p className={styles.change} data-tone={s.change > 0 ? 'bad' : 'good'}>
          {s.change > 0 ? 'Up' : 'Down'} {pct(s.change)} on last month
        </p>
      )}
      {s.insight && <span className={styles.insight}>{s.insight}</span>}
      {s.top.length > 0 ? (
        <ul className={styles.catGrid}>
          {s.top.map((cat) => (
            <li key={cat.id}>
              <span>{cat.name}</span>
              <strong>
                <Money value={cat.amount} />
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No expenses recorded this month.</p>
      )}
    </section>
  );
}

function IncomeBlock({ v }: { v: HomeLogic }) {
  const i = v.income;
  const largest = [...i.sources].sort((a, b) => b.received - a.received)[0];
  return (
    <section className={styles.block} aria-label="Income">
      <BlockHead
        icon={<ArrowDownLeft size={16} strokeWidth={2} />}
        title="Income"
        right={
          <span className={styles.expected}>
            <span>
              Expected <Money value={i.expected} />
            </span>
            <span className={styles.underline}>
              <span style={{ width: `${i.expected > 0 ? Math.min(100, (i.received / i.expected) * 100) : 0}%` }} />
            </span>
          </span>
        }
      />
      <p className={styles.bigFigure} data-tone="in">
        <Money value={i.received} currency={v.currency} />
      </p>
      <p className={styles.muted}>
        received this month
        {i.change !== null && (
          <span className={styles.change} data-tone={i.change >= 0 ? 'good' : 'bad'}>
            {' '}
            {i.change >= 0 ? 'up' : 'down'} {pct(i.change)} on last month
          </span>
        )}
      </p>
      <ul className={styles.sources}>
        {i.sources.map((src) => {
          const share = src.expected > 0 ? src.received / src.expected : src.received > 0 ? 1 : 0;
          return (
            <li key={src.id}>
              <span className={styles.sourceHead}>
                <span>{src.label}</span>
                {src === largest && src.received > 0 && i.received > 0 && <span className={styles.pill}>{pct(src.received / i.received)}</span>}
                <span className={styles.sourceAmounts}>
                  <Money value={src.received} /> / <Money value={src.expected} />
                </span>
              </span>
              <span className={styles.bar}>
                <span style={{ width: `${Math.min(100, share * 100)}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TX_ICON: Record<HomeTx['kind'], ReactNode> = {
  income: <ArrowDownLeft size={15} strokeWidth={2} />,
  expense: <ArrowUpRight size={15} strokeWidth={2} />,
  savings: <PiggyBank size={15} strokeWidth={2} />,
  transfer: <ArrowLeftRight size={15} strokeWidth={2} />,
};

function whenText(d: Date, now: Date) {
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function TransactionsBlock({ v }: { v: HomeLogic }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const waiting = v.ready.entries.slice(0, 2);
  return (
    <section className={styles.block} aria-label="Transactions">
      <BlockHead
        icon={<ArrowLeftRight size={16} strokeWidth={2} />}
        title="Transactions"
        right={
          <button type="button" className={styles.iconButton} aria-label="Transaction actions" onClick={(e) => setMenu(e.currentTarget)}>
            <MoreHorizontal size={17} strokeWidth={2} />
          </button>
        }
      />
      {waiting.length > 0 && (
        <ul className={styles.txList}>
          {waiting.map((e) => (
            <li key={e.id} className={styles.txWaiting}>
              <span className={styles.txIcon} data-kind="expense" aria-hidden>
                {TX_ICON.expense}
              </span>
              <span className={styles.txMain}>
                <span className={styles.txName}>{e.name}</span>
                <span className={styles.txNote}>Waiting for confirmation</span>
              </span>
              <span className={styles.txAmount} data-kind="expense">
                <Money value={-e.amount} />
              </span>
              <button type="button" className={styles.confirm} aria-label={`Confirm ${e.name}`} disabled={v.ready.busy} onClick={() => void v.confirmOne(e)}>
                <Check size={15} strokeWidth={2.5} />
              </button>
              <button type="button" className={styles.dismiss} aria-label={`Skip ${e.name}`} onClick={() => void v.skip(e)}>
                <X size={15} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {v.latest.length === 0 ? (
        <p className={styles.muted}>No transactions yet.</p>
      ) : (
        <ul className={styles.txList}>
          {v.latest.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className={styles.txRow}>
                <span className={styles.txIcon} data-kind={t.kind} aria-hidden>
                  {TX_ICON[t.kind]}
                </span>
                <span className={styles.txMain}>
                  <span className={styles.txName}>{t.name}</span>
                  <span className={styles.txWhen}>{whenText(t.when, v.now)}</span>
                </span>
                <span className={styles.txAmount} data-kind={t.kind}>
                  <Money value={t.amount} sign={t.kind !== 'transfer'} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/transactions" className={styles.seeAll}>
        See all <ArrowRight size={14} strokeWidth={2} aria-hidden />
      </Link>
      {menu && (
        <Popover anchor={menu} label="Transaction actions" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            <Link href="/transactions" onClick={() => setMenu(null)}>
              See all
            </Link>
            <Link href="/add-transaction" onClick={() => setMenu(null)}>
              Add
            </Link>
          </div>
        </Popover>
      )}
    </section>
  );
}

// ---- Row 3 ----

function UpcomingBlock({ v }: { v: HomeLogic }) {
  return (
    <section className={styles.block} aria-label="Upcoming payments">
      <BlockHead icon={<HandCoins size={16} strokeWidth={2} />} title="Upcoming payments" right={<Link href="/payments">See all</Link>} />
      {v.upcoming.length === 0 ? (
        <p className={styles.muted}>Nothing left to pay this month.</p>
      ) : (
        <ul className={styles.rows}>
          {v.upcoming.map((u) => (
            <li key={u.key}>
              <Link href={u.href} className={styles.upRow}>
                <span className={styles.txMain}>
                  <span className={styles.txName}>{u.name}</span>
                  <span className={styles.txWhen}>{u.bucket}</span>
                </span>
                <span className={styles.upSide}>
                  <strong>
                    <Money value={u.amount} />
                  </strong>
                  <span data-late={u.late || undefined}>{u.due}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountsBlock({ v }: { v: HomeLogic }) {
  return (
    <section className={styles.block} aria-label="Accounts">
      <BlockHead icon={<Wallet size={16} strokeWidth={2} />} title="Accounts" right={<Link href="/wallets">See accounts</Link>} />
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Account</th>
            <th data-num>Balance</th>
            <th data-num title="Unpaid lines this month paid from this account">Committed this month</th>
          </tr>
        </thead>
        <tbody>
          {v.accountRows.map((a) => (
            <tr key={a.id}>
              <td>
                <span className={styles.dot} style={{ background: a.color }} aria-hidden />
                {a.name}
              </td>
              <td data-num>
                <Money value={a.balance} />
              </td>
              <td data-num data-tone={a.committed > a.balance ? 'bad' : undefined}>
                {a.committed ? <Money value={a.committed} /> : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CashFlowBlock({ v }: { v: HomeLogic }) {
  const [hidden] = useAmountsHidden();
  const short = (n: number) => (hidden ? '' : Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  return (
    <section className={styles.block} aria-label="Cash flow">
      <BlockHead
        icon={<TrendingUp size={16} strokeWidth={2} />}
        title={v.flowView === 'week' ? 'Cash flow, last 30 days' : 'Cash flow, last 6 months'}
        right={
          <span className={styles.segment} role="radiogroup" aria-label="View">
            {(['week', 'month'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={v.flowView === k} onClick={() => v.setFlowView(k)}>
                {k === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </span>
        }
      />
      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={v.flow} margin={{ top: 22, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#edf0f6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={44} tickFormatter={short} />
            <Tooltip formatter={(value) => (hidden ? HIDDEN_AMOUNT : formatMoney(Number(value ?? 0)))} />
            <Bar dataKey="income" name="Income" fill="#3965fa" />
            <Bar dataKey="expense" name="Expenses" fill="#1b1b39">
              <LabelList dataKey="net" position="top" formatter={(n) => (hidden ? '' : `${Number(n) >= 0 ? '+' : '−'}${short(Math.abs(Number(n)))}`)} style={{ fontSize: 12, fill: '#6b7085' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className={styles.legend}>
          <span data-kind="in">Income</span>
          <span data-kind="out">Expenses</span>
          <span className={styles.muted}>Net above each pair</span>
        </p>
      </div>
    </section>
  );
}

function PlanBlock({ v }: { v: HomeLogic }) {
  return (
    <section className={styles.block} aria-label="This month's plan">
      <BlockHead icon={<ReceiptText size={16} strokeWidth={2} />} title="This month's plan" right={<Link href="/budget">Open budget</Link>} />
      <ul className={styles.sources}>
        {v.plan.map((p) => (
          <li key={p.id}>
            <span className={styles.sourceHead}>
              <span>{p.label}</span>
              <span className={styles.sourceAmounts}>
                <Money value={p.done} /> of <Money value={p.planned} /> {p.verb}
              </span>
            </span>
            <span className={styles.bar} data-kind={p.id}>
              <span style={{ width: `${p.planned > 0 ? Math.min(100, (p.done / p.planned) * 100) : 0}%` }} data-over={p.planned > 0 && p.done > p.planned + 0.5 && p.id === 'expenses' ? true : undefined} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DebtBlock({ v }: { v: HomeLogic }) {
  const next = v.debt.next;
  return (
    <section className={styles.block} aria-label="Debt">
      <BlockHead icon={<HandCoins size={16} strokeWidth={2} />} title="Debt" right={<Link href="/debts">Open debt</Link>} />
      {v.debt.count === 0 ? (
        <p className={styles.muted}>No debts. Nice.</p>
      ) : (
        <>
          <p className={styles.bigFigure} data-tone="bad">
            <Money value={v.debt.total} currency={v.currency} />
          </p>
          <p className={styles.muted}>
            owed across {v.debt.count} {v.debt.count === 1 ? 'debt' : 'debts'}
          </p>
          {next && (
            <p className={styles.nextDebt}>
              Next payment: {next.nextPaymentAmount ? <><Money value={next.nextPaymentAmount} /> to </> : null}
              {next.name} on {next.nextPaymentDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
