'use client';

// The Money dashboard's sections (owner, 24 Nov 2026), shared by the web and
// phone Home screens. In order:
//   Headline   one card of five figures (balance, money in, money out,
//              transfers, saved), each against last month;
//   CashFlow   income above the line and expenses below it, 12 weeks or 12
//              months;
//   Budget     this month's lines as hatched bars, fullest first;
//   Spending   the donut and its legend;
//   AccountabilityMini  accounted for against unaccounted, per period;
//   Commitments  planned, paid, still to pay and overdue, then the next
//              payment and the debts;
//   WalletsCard  the share bar and the largest wallets;
//   Recent     the latest activity.
// QuickActions sits on the phone only. Data comes from src/logic/home; the
// screens only arrange these.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bar, BarChart, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUp, ArrowUpRight, ChevronDown, HandCoins, History, Info, Plus, ShoppingBasket } from 'lucide-react';
import type { HomeLogic, HomeTx } from '@/src/logic/home/useLogic';
import { compact } from '@/src/shared/dashboard/format';
import { useAccountability } from '@/src/shared/hooks/useAccountability';
import { UNJUSTIFIED_WALLET_ID } from '@/src/shared/firestore/refs';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { accountabilitySentence, rateText, type Period, type PeriodAccountability } from '@/src/viewmodels/accountability';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { formatMoney } from '@/src/widgets/Money/Money';
import { SeeAll } from '@/src/widgets/SeeAll/SeeAll';
import styles from './MoneyHome.module.css';

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const DONUT = [1, 2, 3, 4, 5].map((n) => `var(--color-data-categorical-${n})`);
const OTHERS = 'var(--color-border-default)';
const IN = 'var(--color-brand-default)';
const OUT = 'var(--color-card-lilac-decor)';

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

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Row 1: the headline strip ---------- */

type Tone = 'good' | 'bad' | 'muted';

function Cell5({
  marker,
  label,
  tip,
  href,
  value,
  change,
  footer,
  extra,
  wide,
  labelTools,
}: {
  marker: string;
  label: string;
  tip: string;
  href: string;
  value: number;
  change?: { text: string; tone: Tone } | null;
  footer: ReactNode;
  extra?: ReactNode;
  wide?: boolean;
  labelTools?: ReactNode;
}) {
  return (
    <div className={styles.hCell} data-wide={wide || undefined}>
      <div className={styles.hTop}>
        <span className={styles.hLabel}>
          <i className={styles.hMarker} style={{ background: marker }} aria-hidden />
          <Link href={href} className={styles.hLink}>
            {label}
          </Link>
          <span className={styles.hInfo} title={tip} aria-label={tip} tabIndex={0}>
            <Info size={13} strokeWidth={2} aria-hidden />
          </span>
          {labelTools}
        </span>
        <span className={styles.hFigure}>
          <span className={styles.hValue}>{formatMoney(value)}</span>
          {change && (
            <span className={styles.hChange} data-tone={change.tone}>
              {change.text}
            </span>
          )}
        </span>
      </div>
      <div className={styles.hFoot}>
        {footer}
        {extra}
      </div>
    </div>
  );
}

/** The footer: an arrow in a tinted circle, the change, "vs October". */
function ChangeFoot({ amount, last, upIsGood }: { amount: number | null; last: string; upIsGood: boolean }) {
  if (amount === null) return <span className={styles.hMuted}>Nothing to compare with {last} yet</span>;
  const up = amount >= 0;
  const good = upIsGood ? up : !up;
  return (
    <span className={styles.hDelta}>
      <span className={styles.hArrow} data-tone={good ? 'good' : 'bad'} aria-hidden>
        {up ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
      </span>
      {formatMoney(Math.abs(amount))} <span className={styles.hMuted}>vs {last}</span>
    </span>
  );
}

function changeOf(n: number | null | undefined, upIsGood: boolean): { text: string; tone: Tone } | null {
  if (n === null || n === undefined) return null;
  const good = upIsGood ? n >= 0 : n <= 0;
  return { text: `${n >= 0 ? '+' : '-'}${pct(n)}`, tone: good ? 'good' : 'bad' };
}

export function Headline({ v }: { v: HomeLogic }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const safe = v.guide?.today.left ?? null;
  const last = v.lastMonthName;
  const notYet = Math.max(0, v.expected - v.received);
  return (
    <section className={styles.headline} aria-label="This month">
      <Cell5
        wide
        marker={IN}
        label="Total balance"
        tip="Everything in your wallets now, in your display currency."
        href="/wallets"
        value={v.cash}
        labelTools={
          <button type="button" className={styles.currency} onClick={(e) => setMenu(e.currentTarget)} aria-haspopup="menu" aria-label={`Display currency ${v.currency}`}>
            {v.currency}
            <ChevronDown size={12} strokeWidth={2.5} aria-hidden />
          </button>
        }
        footer={
          <span className={styles.hMuted}>
            Spendable {formatMoney(v.spendable)} · Savings {formatMoney(v.savings)}
          </span>
        }
        extra={
          safe !== null ? (
            <Link href="/budget" className={styles.hSafe}>
              Safe to spend today <strong>{formatMoney(Math.max(0, safe))}</strong>
            </Link>
          ) : null
        }
      />
      <Cell5
        marker="var(--color-data-positive)"
        label="Money in"
        tip="Income received this month."
        href="/transactions?type=Income"
        value={v.received}
        change={changeOf(v.income.change, true)}
        footer={<ChangeFoot amount={v.income.changeAmount} last={last} upIsGood />}
        extra={notYet > 0.5 ? <span className={styles.hMuted}>of {formatMoney(v.expected)} expected</span> : null}
      />
      <Cell5
        marker={OUT}
        label="Money out"
        tip="What you spent this month."
        href="/transactions?type=Expense"
        value={v.spending.spent}
        change={changeOf(v.spending.change, false)}
        footer={<ChangeFoot amount={v.spending.changeAmount} last={last} upIsGood={false} />}
      />
      <Cell5
        marker="var(--color-data-categorical-3)"
        label="Transfers"
        tip="Money moved between your wallets this month."
        href="/transactions?type=Transfer"
        value={v.transfers.moved}
        footer={<span className={styles.hMuted}>{v.transfers.planned > 0.5 ? `of ${formatMoney(v.transfers.planned)} planned` : 'Moves between wallets'}</span>}
      />
      <Cell5
        marker="var(--color-data-categorical-4)"
        label="Saved this month"
        tip="Put into savings this month."
        href="/baskets?type=Savings"
        value={v.saved.amount}
        change={changeOf(v.saved.change, true)}
        footer={<span className={styles.hMuted}>{v.saved.shareOfIncome !== null ? `${pct(v.saved.shareOfIncome)} of income` : 'Nothing received yet'}</span>}
      />
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
    </section>
  );
}

/* ---------- Row 2: cash flow, income up and expenses down ---------- */

function FlowTip({ active, payload, label }: { active?: boolean; payload?: { payload: { income: number; expense: number; net: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className={styles.flowTip}>
      <strong>{label}</strong>
      <span>
        <i style={{ background: IN }} /> Income {formatMoney(p.income)}
      </span>
      <span>
        <i style={{ background: OUT }} /> Expenses {formatMoney(p.expense)}
      </span>
      <span>Net {p.net >= 0 ? '+' : '-'}{formatMoney(Math.abs(p.net))}</span>
    </div>
  );
}

export function CashFlow({ v, phone = false }: { v: HomeLogic; phone?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const data = v.flow.map((b) => ({ ...b, out: -b.expense }));
  const income = v.flow.reduce((s, b) => s + b.income, 0);
  const expense = v.flow.reduce((s, b) => s + b.expense, 0);
  const net = income - expense;
  const lastIndex = data.length - 1;
  // A phone shows six periods and scrolls sideways to the rest, opening on the newest.
  useEffect(() => {
    if (phone && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [phone, v.flowView, data.length]);
  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        stackOffset="sign"
        barCategoryGap="28%"
        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
        onMouseMove={(s) => setHover(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null)}
        onMouseLeave={() => setHover(null)}
      >
        <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} />
        <YAxis width={phone ? 0 : 44} hide={phone} axisLine={false} tickLine={false} tickFormatter={(n: number) => compact(Math.abs(n))} tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} />
        <ReferenceLine y={0} stroke="var(--color-border-strong, var(--color-text-tertiary))" />
        <Tooltip cursor={{ fill: 'var(--color-bg-sunken)' }} content={<FlowTip />} trigger={phone ? 'click' : 'hover'} />
        <Bar dataKey="income" stackId="f" fill={IN} radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fillOpacity={(hover === null ? i === lastIndex : hover === i) ? 1 : 0.6} />
          ))}
        </Bar>
        <Bar dataKey="out" stackId="f" fill={OUT} radius={[0, 0, 6, 6]} maxBarSize={28} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fillOpacity={(hover === null ? i === lastIndex : hover === i) ? 1 : 0.6} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  return (
    <section className={`${styles.card} ${styles.flowCard}`} aria-label="Cash flow">
      <CardHead title="Cash flow" sub={`Money in and money out, by ${v.flowView}`} href="/statistics#section-cash-flow">
        {!phone && <Segmented label="Group by" value={v.flowView} onChange={v.setFlowView} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />}
      </CardHead>
      {phone && <Segmented label="Group by" value={v.flowView} onChange={v.setFlowView} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />}
      <div className={styles.flowFigures}>
        <span>
          <i style={{ background: IN }} aria-hidden /> Money in <strong>+{formatMoney(income)}</strong>
        </span>
        <span>
          <i style={{ background: OUT }} aria-hidden /> Money out <strong>-{formatMoney(expense)}</strong>
        </span>
        <span>
          Net{' '}
          <strong data-tone={net >= 0 ? 'good' : 'bad'}>
            {net >= 0 ? '+' : '-'}
            {formatMoney(Math.abs(net))}
          </strong>
        </span>
      </div>
      {phone ? (
        <div ref={scroller} className={styles.flowScroll}>
          <div className={styles.flowChartPhone} style={{ width: `${Math.max(100, (data.length / 6) * 100)}%` }}>
            {chart}
          </div>
        </div>
      ) : (
        <div className={styles.flowChart}>{chart}</div>
      )}
    </section>
  );
}

/* ---------- Row 3: Budget, Spending, Accountability, Commitments, Wallets ---------- */

export function Budget({ v, max = 8 }: { v: HomeLogic; max?: number }) {
  const month = v.monthName;
  const lines = v.budgetLines.slice(0, max);
  return (
    <section className={`${styles.card} ${styles.tall}`} aria-label={`${month} budget`}>
      <CardHead
        title={`${month} budget`}
        sub={v.budgetUsed !== null ? `${pct(v.budgetUsed)} used · ${v.daysLeft} ${v.daysLeft === 1 ? 'day' : 'days'} left` : `${v.daysLeft} ${v.daysLeft === 1 ? 'day' : 'days'} left`}
        href="/budget"
      />
      {lines.length === 0 ? (
        <p className={styles.bodyText}>
          No spending planned for {month} yet. <Link href="/budget">Plan the month</Link>
        </p>
      ) : (
        <ul className={styles.bList}>
          {lines.map((l) => {
            const over = l.spent - l.planned;
            const ratio = share(l.spent, l.planned);
            const tone = over > 0.5 ? 'danger' : ratio >= 0.7 ? 'warning' : 'brand';
            return (
              <li key={l.id}>
                <div className={styles.bHead}>
                  <span className={styles.bName}>{l.name}</span>
                  <span className={styles.bSpent}>{formatMoney(l.spent)}</span>
                  <span className={styles.bChip} data-tone={over > 0.5 ? 'danger' : undefined}>
                    {over > 0.5 ? `Over by ${formatMoney(over)}` : `${formatMoney(l.planned - l.spent)} left`}
                  </span>
                </div>
                <span className={styles.bTrack} aria-hidden>
                  <span className={styles.bFill} data-tone={tone} style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {v.budgetLines.length > 0 && (
        <div className={styles.cardEnd}>
          <SeeAll href="/budget" label="See full budget" />
        </div>
      )}
    </section>
  );
}

export function Spending({ v }: { v: HomeLogic }) {
  const s = v.spending;
  const rows = [...s.top.map((t, i) => ({ key: t.id, name: t.name, amount: t.amount, color: DONUT[i] })), ...(s.others > 0.5 ? [{ key: 'others', name: 'Everything else', amount: s.others, color: OTHERS }] : [])];
  const last = v.lastMonthName;
  const diff = s.last - s.spent;
  const trend = s.change === null ? null : `${s.change <= 0 ? 'Down' : 'Up'} ${pct(s.change)} on ${last}, about ${formatMoney(Math.abs(diff))} ${diff >= 0 ? 'less' : 'more'} so far.`;
  return (
    <section className={styles.card} aria-label="Spending">
      <CardHead title="Spending" sub={`${v.monthName}, against your budget`} href="/statistics#section-unplanned-spending" />
      <div className={styles.spendBody}>
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
            {s.planned > 0 && <span>of {formatMoney(s.planned)}</span>}
          </div>
        </div>
        <ul className={styles.keyList}>
          {rows.map((r) => (
            <li key={r.key}>
              <i style={{ background: r.color }} aria-hidden />
              <span>{r.name}</span>
              <strong>{formatMoney(r.amount)}</strong>
            </li>
          ))}
          {rows.length === 0 && <li className={styles.bodyText}>Nothing spent yet this month.</li>}
        </ul>
      </div>
      {trend && <p className={`${styles.bodyText} ${styles.cardEnd}`}>{trend}</p>}
    </section>
  );
}

/** Accountability, compact (the full card is on Insights). */
export function AccountabilityMini({ v, phone = false }: { v: HomeLogic; phone?: boolean }) {
  const [period, setPeriod] = useState<Period>('month');
  const { rows } = useAccountability({ period, count: period === 'month' ? 6 : phone ? 6 : 7 });
  const cur: PeriodAccountability | undefined = rows[rows.length - 1];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.outflow - r.unaccounted, r.unaccounted)));
  const short = (r: PeriodAccountability) => (period === 'month' ? r.label.slice(0, 3) : r.label.split(' to ')[0]);
  return (
    <section className={styles.card} aria-label="Accountability">
      <CardHead title="Accountability" href="/statistics#section-accountability">
        <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </CardHead>
      <div className={styles.aFigures}>
        <span>
          <i style={{ background: 'var(--color-status-success-fg, var(--color-data-positive))' }} aria-hidden />
          Accounted for <strong>{cur ? rateText(cur.rate) : 'No spending'}</strong>
        </span>
        <span>
          <i style={{ background: 'var(--color-data-negative)' }} aria-hidden />
          Unaccounted <strong>{formatMoney(cur?.unaccounted ?? 0)}</strong>
        </span>
      </div>
      <div className={styles.aChart} role="img" aria-label={accountabilitySentence(rows)}>
        {rows.map((r) => {
          const accounted = Math.max(0, r.outflow - r.unaccounted);
          const tone = r.rate === null ? undefined : r.rate >= 0.9 ? 'good' : r.rate < 0.75 ? 'bad' : undefined;
          return (
            <div key={r.key} className={styles.aCol}>
              <div className={styles.aBars}>
                <span style={{ height: `${Math.round((accounted / max) * 100)}%`, background: 'var(--color-status-success-fg, var(--color-data-positive))' }} />
                <span style={{ height: `${Math.round((r.unaccounted / max) * 100)}%`, background: 'var(--color-data-negative)' }} />
              </div>
              <span className={styles.aRate} data-tone={tone}>
                {rateText(r.rate).replace('No spending', '–')}
              </span>
              <span className={styles.aLabel}>{short(r)}</span>
            </div>
          );
        })}
      </div>
      <p className={`${styles.bodyText} ${styles.cardEnd}`}>
        {accountabilitySentence(rows)}{' '}
        {Math.abs(v.unexplained) >= 0.5 && <Link href={`/wallets/${UNJUSTIFIED_WALLET_ID}`}>Review</Link>}
      </p>
    </section>
  );
}

export function Commitments({ v, phone = false }: { v: HomeLogic; phone?: boolean }) {
  const c = v.commitments;
  const cols = [
    { key: 'planned', label: 'Planned', value: c.planned, color: IN },
    { key: 'paid', label: 'Paid', value: c.paid, color: 'var(--color-status-success-fg, var(--color-data-positive))' },
    { key: 'left', label: 'Still to pay', value: c.left, color: 'var(--color-status-warning-fg, var(--color-data-categorical-4))' },
    { key: 'overdue', label: 'Overdue', value: c.overdue, color: 'var(--color-status-danger-fg, var(--color-data-negative))' },
  ];
  const next = v.upcoming[0];
  const debt = v.debt;
  const fmt = phone ? compact : formatMoney;
  return (
    <section className={styles.card} aria-label="Commitments">
      <CardHead title="Commitments" sub="What this month's plan still needs" href="/payments" />
      <div className={styles.funnel} data-phone={phone || undefined}>
        {cols.map((col) => {
          const h = c.planned > 0.5 ? col.value / c.planned : 0;
          return (
            <div key={col.key} className={styles.fCol}>
              {!phone && (
                <span className={styles.fHead}>
                  <span>{col.label}</span>
                  <strong>{col.value > 0.5 ? fmt(col.value) : 'None'}</strong>
                </span>
              )}
              <span className={styles.fArea}>
                <span className={styles.fBars} style={{ height: col.value > 0.5 ? `${Math.max(4, Math.round(h * 100))}%` : '4px', color: col.color }} />
              </span>
              {phone && (
                <span className={styles.fHead}>
                  <strong>{col.value > 0.5 ? fmt(col.value) : 'None'}</strong>
                  <span>{col.label}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.cardEnd}>
        {next && (
          <Link href={next.href} className={styles.cRow}>
            <span>Next up</span>
            <strong>
              {next.name}, {formatMoney(next.amount)}, {next.due.toLowerCase()}
            </strong>
          </Link>
        )}
        {debt.count > 0 && debt.total > 0.5 && (
          <Link href="/debts" className={styles.cRow}>
            <span>Debts</span>
            <strong>
              {formatMoney(debt.total)} left across {debt.count}
              {debt.next?.nextPaymentDate ? `, next payment ${DAY_MONTH.format(debt.next.nextPaymentDate)}` : ''}
            </strong>
          </Link>
        )}
      </div>
    </section>
  );
}

export function WalletsCard({ v, phone = false }: { v: HomeLogic; phone?: boolean }) {
  const all = v.accountRows;
  const total = all.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const shown = all.slice(0, 6);
  const more = all.length - shown.length;
  const button = (
    <Link href="/wallets" className={styles.secondaryButton} data-full={phone || undefined}>
      See all wallets
    </Link>
  );
  return (
    <section className={styles.card} aria-label="Wallets">
      <CardHead title="Wallets" sub={`Total ${formatMoney(v.cash)} across ${all.length} ${all.length === 1 ? 'wallet' : 'wallets'}`}>
        {!phone && button}
      </CardHead>
      <span className={styles.wBar} aria-hidden>
        {all
          .filter((a) => a.balance > 0.5)
          .map((a) => (
            <span key={a.id} style={{ flexGrow: total > 0 ? a.balance / total : 0, color: a.color }} />
          ))}
      </span>
      <ul className={styles.wGrid}>
        {shown.map((a) => (
          <li key={a.id}>
            <Link href={`/wallets/${a.id}`} className={styles.wItem}>
              <span className={styles.wName}>
                <i style={{ background: a.color }} aria-hidden />
                {a.name}
              </span>
              <strong className={styles.wValue}>{formatMoney(a.balance)}</strong>
              {a.committed > 0.5 && <span className={styles.hMuted}>{formatMoney(a.committed)} committed</span>}
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li>
            <Link href="/wallets" className={`${styles.wItem} ${styles.wMore}`}>
              +{more} more
            </Link>
          </li>
        )}
      </ul>
      {phone && <div className={styles.cardEnd}>{button}</div>}
    </section>
  );
}

/* ---------- Row 4: Recent activity ---------- */

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
  if (diff === 1) return `Yesterday, ${TIME.format(d)}`;
  return `${DAY_MONTH.format(d)}, ${TIME.format(d)}`;
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

/* ---------- Phone only ---------- */

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
