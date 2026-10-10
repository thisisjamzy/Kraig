'use client';

// The minimal phone budget pieces (Minimal.module.css): info sheets, the
// tab's card (laid out like Home's balance card) with its Details sheet, and the grouped basket list
// shared by the Budget tab and the Baskets screen.

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { daysLeftIn, money, monthPhase, monthTitle } from '@/src/viewmodels/planning';
import type { BasketListGroup, MonthSummary } from '@/src/logic/planning/basketList';
import type { MonthTotals } from '@/src/shared/budget/monthTotals';
import { IconCircle } from '@/src/phone/screens/Planning/PlanningParts';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import m from '@/src/phone/screens/Planning/Minimal.module.css';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "21 days left", "Ended", "Not started yet": the line under the month. */
function shortCaption(month: string) {
  const today = new Date();
  const phase = monthPhase(month, today);
  if (phase === 'past') return 'Ended';
  if (phase === 'future') return 'Not started yet';
  const left = daysLeftIn(month, today) ?? 0;
  return left === 0 ? 'Last day' : `${left} ${left === 1 ? 'day' : 'days'} left`;
}

/**
 * The month as a dropdown: "October 2026" with an arrow at 45 degrees and
 * "21 days left" under it. Tapping opens a menu right under the button
 * (year arrows, a grid of months); a tap outside or Esc closes it. Shared
 * by the Budget section and Baskets.
 */
export function MonthPicker({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const [year, setYear] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (year === null) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setYear(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setYear(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [year]);
  const current = Number(month.slice(0, 4));
  return (
    <div className={m.monthWrap} ref={ref}>
      <button type="button" className={m.monthPicker} onClick={() => setYear((open) => (open === null ? current : null))} aria-haspopup="menu" aria-expanded={year !== null}>
        <span className={m.monthPickerText}>
          <span className={m.monthPickerTitle}>
            {monthTitle(month)}
            <ChevronDown size={14} strokeWidth={2.5} className={m.monthPickerArrow} aria-hidden />
          </span>
          <span className={m.monthPickerCaption}>{shortCaption(month)}</span>
        </span>
      </button>
      {year !== null && (
        <div className={m.monthMenu} role="menu" aria-label="Choose month">
          <div className={m.monthMenuYear}>
            <button type="button" className={m.weekNav} onClick={() => setYear(year - 1)} aria-label="Previous year">
              <ChevronLeft size={16} strokeWidth={2.25} />
            </button>
            <span>{year}</span>
            <button type="button" className={m.weekNav} onClick={() => setYear(year + 1)} aria-label="Next year">
              <ChevronRight size={16} strokeWidth={2.25} />
            </button>
          </div>
          <div className={m.monthMenuGrid}>
            {MONTH_SHORT.map((name, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  key={name}
                  type="button"
                  role="menuitemradio"
                  aria-checked={key === month}
                  onClick={() => {
                    onMonth(key);
                    setYear(null);
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** The short explanations behind each info icon (two or three lines each). */
export const INFO = {
  availableNow: {
    title: 'Available now',
    text: 'Income received so far, minus what has been spent and saved. Income you expect but haven’t received isn’t counted.',
  },
  plannedBeyond: {
    title: 'Planned beyond income',
    text: 'Your baskets plan more than the income you expect this month. Lower a basket or plan more income to close the gap.',
  },
  notPlanned: {
    title: 'Not yet planned',
    text: 'Expected income no basket has claimed yet. Give it a job in a basket, or keep it as a cushion.',
  },
  pace: {
    title: 'Pace',
    text: 'What’s left, divided by the days left in the month, today included. Spend about this much a day to finish on plan.',
  },
  byMonthEnd: {
    title: 'By month end',
    text: 'Available now plus the income still expected this month. An estimate: it assumes that income arrives.',
  },
} as const;

export type InfoKey = keyof typeof INFO;

/**
 * A bottom sheet rendered at the end of <body>, with Planning's colours:
 * never inside the card that opened it, so it can't inherit the card's
 * white text.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={p.tokens} style={{ color: 'var(--p-navy)' }}>
      <Modal title={title} onClose={onClose}>
        {children}
      </Modal>
    </div>,
    document.body
  );
}

export function InfoButton({ topic, label }: { topic: InfoKey; label?: string }) {
  const [open, setOpen] = useState(false);
  const info = INFO[topic];
  return (
    <>
      <button type="button" className={m.info} onClick={() => setOpen(true)} aria-label={label ?? `About ${info.title.toLowerCase()}`}>
        <Info size={14} strokeWidth={2.25} aria-hidden />
      </button>
      {open && (
        <Sheet title={info.title} onClose={() => setOpen(false)}>
          <p className={m.sheetText}>{info.text}</p>
        </Sheet>
      )}
    </>
  );
}

/** One short line, with "More" opening the full text in a sheet. */
export function MoreText({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const first = text.split(/\n/)[0];
  return (
    <>
      <p className={m.oneLine}>
        <span>{first}</span>
        <button type="button" className={m.textLink} onClick={() => setOpen(true)}>
          More
        </button>
      </p>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <p className={m.sheetText} style={{ whiteSpace: 'pre-wrap' }}>
            {text}
          </p>
        </Sheet>
      )}
    </>
  );
}

function SheetRow({ label, children, tone }: { label: ReactNode; children: ReactNode; tone?: 'problem' }) {
  return (
    <div className={m.sheetRow}>
      <span>{label}</span>
      <strong data-tone={tone}>{children}</strong>
    </div>
  );
}

export interface CardFigure {
  label: string;
  value: number;
  problem?: boolean;
  info?: InfoKey;
}

/**
 * The tab's one card, laid out like Home's balance card: the main figure
 * with its label, a chip top right, a bar, then smaller figures with
 * smaller labels.
 */
export function MoneyCard({
  amount,
  label,
  chip,
  fill,
  fillLabel,
  problem,
  figures,
  tone,
}: {
  amount: number;
  label: string;
  chip?: { label: string; onClick: () => void };
  fill: number;
  /** What the meter measures: "of income", "paid". */
  fillLabel: string;
  problem?: boolean;
  figures: CardFigure[];
  /** Another gradient, so cards on different screens can be told apart. */
  tone?: 'blue' | 'teal';
}) {
  const pct = Math.round(Math.max(0, fill) * 100);
  return (
    <section className={m.moneyCard} data-tone={tone} aria-label={label}>
      <div className={m.moneyTop}>
        <div>
          <p className={m.moneyAmount}>{money(amount)}</p>
          <span className={m.moneyLabel}>{label}</span>
          {/* A short meter under the label, not the card's whole width. */}
          <span className={m.moneyMeter}>
            <span className={m.moneyTrack} role="img" aria-label={`${pct}% ${fillLabel}`}>
              <span style={{ width: `${Math.min(100, pct)}%` }} data-tone={problem ? 'problem' : undefined} />
            </span>
            <span className={m.moneyMeterText}>
              {pct}% {fillLabel}
            </span>
          </span>
        </div>
        {chip && (
          <button type="button" className={m.moneyChip} onClick={chip.onClick}>
            {chip.label}
          </button>
        )}
      </div>
      <div className={m.moneyFigures}>
        {figures.map((f) => (
          <div key={f.label} className={m.moneyFigure}>
            <span className={m.moneyFigureLabel}>
              {f.label}
              {f.info && <InfoButton topic={f.info} />}
            </span>
            <span className={m.moneyFigureValue} data-tone={f.problem ? 'problem' : undefined}>
              {money(f.value)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Budget tab: the main figure is the month's total budgeted; Details opens the full breakdown. */
export function BudgetCard({ summary, totals, currency, month }: { summary: MonthSummary; totals: MonthTotals; currency: string; month: string }) {
  const [details, setDetails] = useState(false);
  const pair = (actual: number, planned: number) => `${money(actual)} / ${money(planned)}`;
  const monthName = monthTitle(month).split(' ')[0];
  return (
    <>
      <MoneyCard
        amount={summary.plannedOut}
        label={`Budgeted for ${monthName}`}
        chip={{ label: 'Details', onClick: () => setDetails(true) }}
        fill={summary.comingIn > 0 ? summary.plannedOut / summary.comingIn : summary.fill}
        fillLabel="of income"
        problem={summary.overPlanned}
        figures={[
          { label: 'Coming in', value: summary.comingIn },
          summary.overPlanned
            ? { label: 'Over income', value: -summary.unplanned, problem: true, info: 'plannedBeyond' }
            : { label: 'Not planned', value: Math.max(0, summary.unplanned), info: 'notPlanned' },
          { label: 'Available', value: totals.availableNow, info: 'availableNow' },
        ]}
      />
      {details && (
        <Sheet title={`${monthTitle(month)}`} onClose={() => setDetails(false)}>
          <p className={m.sheetText}>Actual / planned, in {currency}.</p>
          <div className={m.sheetRows}>
            <SheetRow label="Income">{pair(totals.income.received, totals.income.expected)}</SheetRow>
            <SheetRow label="Expenses" tone={totals.expenses.spent > totals.expenses.planned + 0.5 ? 'problem' : undefined}>
              {pair(totals.expenses.spent, totals.expenses.planned)}
            </SheetRow>
            <SheetRow label="Savings">{pair(totals.savings.saved, totals.savings.planned)}</SheetRow>
            <SheetRow label="Moved between wallets">{pair(totals.transfers.moved, totals.transfers.planned)}</SheetRow>
            <SheetRow label="Transfer fees">{money(totals.expenses.fees)}</SheetRow>
            <SheetRow label="Borrowed">{money(totals.income.borrowed)}</SheetRow>
            <SheetRow
              label={
                <>
                  Available now <InfoButton topic="availableNow" />
                </>
              }
            >
              {money(totals.availableNow)}
            </SheetRow>
            <SheetRow
              label={
                <>
                  By month end <InfoButton topic="byMonthEnd" />
                </>
              }
            >
              {money(totals.availableByMonthEnd)}
            </SheetRow>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** A row: icon, name (wraps), one grey line, used / planned, and a thin line under it. */
export function BasketRow({
  href,
  type,
  name,
  line,
  used,
  planned,
  problem,
  progress,
}: {
  href: string;
  type: string;
  name: string;
  line: string;
  used: number;
  planned: number;
  problem: boolean;
  progress: number;
}) {
  return (
    <Link href={href} className={m.row}>
      <IconCircle type={type} />
      <span className={m.main}>
        <span className={m.name}>{name}</span>
        <span className={m.line} data-tone={problem ? 'problem' : undefined}>
          {line}
        </span>
      </span>
      <span className={m.side}>
        <span className={m.figure}>
          {money(used)}
          <small> / {money(planned)}</small>
        </span>
        {/* Just under the amounts, as wide as they are. */}
        <span className={m.sideBar} aria-hidden>
          <span style={{ width: `${progress * 100}%` }} data-tone={problem ? 'problem' : undefined} />
        </span>
      </span>
    </Link>
  );
}

/** Baskets grouped under small labels (Income, Expenses, Savings, Transfers), each group collapsible. */
export function BasketGroups({ groups, month, newHref }: { groups: BasketListGroup[]; month: string; newHref: string }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (type: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  return (
    <div className={m.bleed}>
      {groups.map((group) => {
        const open = !closed.has(group.type);
        return (
          <section key={group.type} className={m.section} aria-label={group.label}>
            <div className={m.sectionHead}>
              <button type="button" className={m.groupToggle} aria-expanded={open} onClick={() => toggle(group.type)}>
                <ChevronDown size={14} strokeWidth={2.5} aria-hidden />
                <span className={m.label}>{group.label}</span>
              </button>
              <span className={m.groupTotal}>
                {money(group.used)} / {money(group.planned)}
              </span>
            </div>
            {open && (
              <div className={m.list}>
                {group.rows.map((row) => (
                  <BasketRow
                    key={row.id}
                    href={`/budget/basket/${row.id}?month=${month}`}
                    type={row.type}
                    name={row.name}
                    line={row.line}
                    used={row.used}
                    planned={row.planned}
                    problem={row.problem}
                    progress={row.progress}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <div className={`${m.list} ${m.section}`}>
        <Link href={newHref} className={m.quiet}>
          <Plus size={16} strokeWidth={2.5} aria-hidden />
          New basket
        </Link>
      </div>
    </div>
  );
}

/** "3 payments overdue · 43,900 ›" — one line, only when something needs doing. */
export function NeedsYouRow({ text, amount, onOpen }: { text: string; amount: number | null; onOpen: () => void }) {
  return (
    <div className={`${m.bleed} ${m.section}`}>
      <div className={m.list}>
        <button type="button" className={m.needs} onClick={onOpen}>
          <span className={m.needsDot} aria-hidden />
          <span className={m.main}>
            <span className={m.name}>
              {text}
              {amount !== null && ` · ${money(amount)}`}
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
