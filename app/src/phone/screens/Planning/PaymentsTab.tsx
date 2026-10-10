'use client';

// Planning > Payments on a phone, minimal (Minimal.module.css): a card like
// Home's (spent so far this month, then payments paid, still to pay and
// overdue in smaller type), one week
// strip with a dot per payment (swipe or the arrows for other weeks, "Show
// month" for the whole grid), then the month's payments as a full-width
// list grouped by Overdue, This week, Later this month and Paid. Each row:
// its type icon (the same circle as the basket rows), name, one grey line ("1 Oct · Momo Virtual Card · House"), the amount, and
// a blue "Pay" that opens the expense form with what's still due suggested.
// Only Payment items are listed: allowances and set asides are never due.

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { payHref, usePaymentsTab, type MonthPayment } from '@/src/logic/planning/usePaymentsTab';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { dayMonth, money, monthTitle } from '@/src/viewmodels/planning';
import { IconCircle } from '@/src/phone/screens/Planning/PlanningParts';
import { MoneyCard } from '@/src/phone/screens/Planning/MinimalParts';
import m from '@/src/phone/screens/Planning/Minimal.module.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function PaymentRow({ payment, month }: { payment: MonthPayment; month: string }) {
  const paid = payment.status === 'paid';
  const line = [dayMonth(payment.due), payment.method, payment.bucketName].filter(Boolean).join(' · ');
  return (
    <div className={m.rowWrap}>
      <Link href={`/budget/item/${payment.bucketId}/${payment.itemId}?month=${month}`} className={m.row}>
        <IconCircle type={payment.categoryType} />
        <span className={m.main}>
          <span className={m.name}>{payment.name}</span>
          <span className={m.line}>{payment.paid > 0 && !paid ? `${line} · ${money(payment.paid)} of ${money(payment.amount)} paid` : line}</span>
        </span>
        <span className={m.side}>
          <span className={m.figure} data-tone={payment.status === 'overdue' ? 'problem' : undefined}>
            {money(paid ? payment.amount : payment.remaining || payment.amount)}
          </span>
        </span>
      </Link>
      {!paid && (
        <Link className={m.action} href={payHref(payment, month)}>
          Pay
        </Link>
      )}
    </div>
  );
}

function Day({ d, inMonth, today, selected, dots, onPick }: { d: Date; inMonth: boolean; today: boolean; selected: boolean; dots: string[]; onPick: () => void }) {
  return (
    <button
      type="button"
      className={m.weekDay}
      data-outside={!inMonth || undefined}
      data-today={today || undefined}
      aria-pressed={selected}
      disabled={!inMonth}
      onClick={onPick}
      aria-label={`${dayMonth(d)}${dots.length ? `, ${dots.length} ${dots.length === 1 ? 'payment' : 'payments'}` : ''}`}
    >
      <span className={m.weekName}>{WEEKDAYS[d.getDay()]}</span>
      <span className={m.weekNum}>{d.getDate()}</span>
      <span className={m.dots} aria-hidden>
        {dots.slice(0, 3).map((status, i) => (
          <span key={i} data-status={status} />
        ))}
      </span>
    </button>
  );
}

export function PaymentsTab({
  month,
  data,
  onMonth,
  bucket,
  setBucket,
}: {
  month: string;
  data: PlanningData;
  onMonth: (month: string) => void;
  bucket: string | null;
  setBucket: (bucket: string | null) => void;
}) {
  const p = usePaymentsTab(month, data, bucket);
  const [y, mo] = month.split('-').map(Number);
  const today = new Date();
  const todayKey = key(today);
  const inThisMonth = today.getFullYear() === y && today.getMonth() === mo - 1;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(inThisMonth ? today : new Date(y, mo - 1, 1)));
  const [showMonth, setShowMonth] = useState(false);
  // Follow the month when it changes in the header.
  const [weekMonth, setWeekMonth] = useState(month);
  if (weekMonth !== month) {
    setWeekMonth(month);
    setWeekStart(startOfWeek(inThisMonth ? today : new Date(y, mo - 1, 1)));
  }

  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    // Past the month's edge: move to the next or previous month.
    if (addDays(next, 6) < first) return onMonth(`${first.getMonth() === 0 ? y - 1 : y}-${String(first.getMonth() === 0 ? 12 : first.getMonth()).padStart(2, '0')}`);
    if (next > last) return onMonth(`${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`);
    setWeekStart(next);
  }
  const touch = useRef<number | null>(null);

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
  const grid = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const day = (d: Date) => (
    <Day
      key={key(d)}
      d={d}
      inMonth={d.getMonth() === mo - 1}
      today={key(d) === todayKey}
      selected={p.selectedDay === key(d)}
      dots={p.dotsByDay.get(key(d)) ?? []}
      onPick={() => p.pickDay(key(d))}
    />
  );

  // Groups: Overdue, This week, Later this month, Paid.
  const weekEnd = addDays(startOfWeek(today), 7);
  const overdue = p.open.filter((x) => x.status === 'overdue');
  const thisWeek = p.open.filter((x) => x.status !== 'overdue' && inThisMonth && x.due < weekEnd);
  const later = p.open.filter((x) => x.status !== 'overdue' && !thisWeek.includes(x));
  const groups: { label: string; rows: MonthPayment[] }[] = [
    { label: 'Overdue', rows: overdue },
    { label: 'This week', rows: thisWeek },
    { label: inThisMonth ? 'Later this month' : monthTitle(month), rows: later },
    { label: 'Paid', rows: p.paid },
  ];

  // The card: spent so far this month, then this month's payments.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const due = r2(p.payments.reduce((sum, x) => sum + x.amount, 0));
  const paidSoFar = r2(p.payments.reduce((sum, x) => sum + (x.status === 'paid' ? x.amount : x.paid), 0));
  const overdueLeft = r2(p.payments.filter((x) => x.status === 'overdue').reduce((sum, x) => sum + (x.remaining || x.amount), 0));
  const monthName = monthTitle(month).split(' ')[0];

  return (
    <>
      <MoneyCard
        amount={data.totals.expenses.spent}
        label={`Spent in ${monthName}`}
        fill={due > 0 ? paidSoFar / due : 0}
        fillLabel="of payments paid"
        figures={[
          { label: 'Payments paid', value: paidSoFar },
          { label: 'Still to pay', value: r2(Math.max(0, due - paidSoFar)) },
          { label: 'Overdue', value: overdueLeft, problem: overdueLeft > 0 },
        ]}
      />

      <div className={`${m.bleed} ${m.section}`}>
        {showMonth ? (
          <>
            <div className={m.monthGrid}>{grid.map(day)}</div>
          </>
        ) : (
          <div
            className={m.week}
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              if (start === null) return;
              const dx = e.changedTouches[0].clientX - start;
              if (Math.abs(dx) > 40) shiftWeek(dx < 0 ? 1 : -1);
            }}
          >
            <button type="button" className={m.weekNav} onClick={() => shiftWeek(-1)} aria-label="Previous week">
              <ChevronLeft size={18} strokeWidth={2.25} />
            </button>
            <div className={m.weekDays}>{week.map(day)}</div>
            <button type="button" className={m.weekNav} onClick={() => shiftWeek(1)} aria-label="Next week">
              <ChevronRight size={18} strokeWidth={2.25} />
            </button>
          </div>
        )}
        <div className={m.calendarFoot}>
          <button type="button" className={m.textLink} onClick={() => setShowMonth((x) => !x)}>
            {showMonth ? 'Show week' : 'Show month'}
          </button>
        </div>
      </div>

      {(p.bucketName || p.selectedDay) && (
        <p className={m.oneLine}>
          <span>
            {p.selectedDay ? `Due on ${dayMonth(new Date(`${p.selectedDay}T00:00:00`))}` : ''}
            {p.selectedDay && p.bucketName ? ' · ' : ''}
            {p.bucketName ?? ''}
          </span>
          <button
            type="button"
            className={m.textLink}
            onClick={() => {
              p.clearDay();
              setBucket(null);
            }}
          >
            <X size={14} strokeWidth={2.5} aria-hidden /> Clear
          </button>
        </p>
      )}

      <div className={m.bleed}>
        {p.payments.length === 0 ? (
          <div className={m.section}>
            <p className={m.empty}>No payments due this month.</p>
          </div>
        ) : (
          groups.map((group) =>
            group.rows.length ? (
              <section key={group.label} className={m.section} aria-label={group.label}>
                <div className={m.sectionHead}>
                  <span className={m.label} style={group.label === 'Overdue' ? { color: 'var(--p-red)' } : undefined}>
                    {group.label}
                  </span>
                  <span className={m.groupTotal}>{money(group.rows.reduce((s, r) => s + (r.status === 'paid' ? r.amount : r.remaining || r.amount), 0))}</span>
                </div>
                <div className={m.list}>
                  {group.rows.map((payment) => (
                    <PaymentRow key={payment.id} payment={payment} month={month} />
                  ))}
                </div>
              </section>
            ) : null
          )
        )}
      </div>
    </>
  );
}
