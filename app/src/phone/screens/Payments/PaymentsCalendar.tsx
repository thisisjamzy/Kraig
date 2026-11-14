'use client';

// The payments month on a phone, drawn from Dreda.figcraft `Calendar /
// Phone`: the year over the month name with round previous and next
// buttons; a white card of days (Monday first) where a day with payments
// carries a short mark (danger when one is late, brand otherwise) and today
// is a filled brand circle; then the chosen day ("Saturday 14", what's due)
// with each payment as a card with a coloured edge. Tapping an open payment
// marks it paid; a paid one opens its item.

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MonthPayment } from '@/src/logic/planning/usePaymentsTab';
import styles from './PaymentsCalendar.module.css';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const amount = (n: number) => Math.round(n).toLocaleString('en-US');

export function PaymentsCalendar({
  month,
  onMonth,
  payments,
  onOpen,
}: {
  month: string;
  onMonth: (delta: number) => void;
  payments: MonthPayment[];
  onOpen: (payment: MonthPayment) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const todayIso = iso(new Date());
  const [picked, setPicked] = useState<string | null>(null);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => new Date(y, m - 1, 1 - lead + i));
  const byDay = new Map<string, MonthPayment[]>();
  for (const p of payments) byDay.set(iso(p.due), [...(byDay.get(iso(p.due)) ?? []), p]);
  const fallback = todayIso.slice(0, 7) === month ? todayIso : `${month}-01`;
  const shown = picked && picked.slice(0, 7) === month ? picked : fallback;
  const list = byDay.get(shown) ?? [];
  const shownDate = new Date(`${shown}T00:00:00`);
  const due = list.filter((p) => p.status !== 'paid').reduce((s, p) => s + p.remaining, 0);

  return (
    <section className={styles.wrap} aria-label="Payments calendar">
      <header className={styles.head}>
        <span className={styles.titles}>
          <span className={styles.year}>{y}</span>
          <span className={styles.month}>{first.toLocaleDateString('en-GB', { month: 'long' })}</span>
        </span>
        <button type="button" className={styles.round} onClick={() => onMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <button type="button" className={styles.round} onClick={() => onMonth(1)} aria-label="Next month">
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </header>

      <div className={styles.card}>
        <div className={styles.grid}>
          {WEEKDAYS.map((w, i) => (
            <span key={i} className={styles.weekday} aria-hidden>
              {w}
            </span>
          ))}
          {cells.map((d) => {
            const key = iso(d);
            const items = byDay.get(key) ?? [];
            const late = items.some((p) => p.status === 'overdue');
            const open = items.some((p) => p.status !== 'paid');
            return (
              <button
                key={key}
                type="button"
                className={styles.day}
                data-outside={d.getMonth() !== m - 1 || undefined}
                data-today={key === todayIso || undefined}
                aria-pressed={key === shown}
                aria-label={`${d.toDateString()}, ${items.length} ${items.length === 1 ? 'payment' : 'payments'}`}
                onClick={() => setPicked(key)}
              >
                <span className={styles.num}>{d.getDate()}</span>
                <span className={styles.mark} data-tone={items.length ? (late ? 'late' : open ? 'open' : 'paid') : undefined} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.dayHead}>
        <span className={styles.dayTitle}>{shownDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' })}</span>
        <span className={styles.daySub}>{list.length ? `${list.length} ${list.length === 1 ? 'payment' : 'payments'}${due ? ` · ${amount(due)} to pay` : ' · all paid'}` : 'Nothing due'}</span>
      </div>
      {list.map((p) => (
        <button key={p.id} type="button" className={styles.item} data-tone={p.status === 'overdue' ? 'late' : p.status === 'paid' ? 'paid' : 'open'} onClick={() => onOpen(p)}>
          <span className={styles.itemName}>{p.name}</span>
          <span className={styles.itemMeta}>
            {p.status === 'paid' ? `Paid · ${amount(p.paid)}` : `${p.status === 'overdue' ? 'Overdue · ' : ''}${amount(p.remaining)} to pay`} · {p.bucketName}
          </span>
        </button>
      ))}
    </section>
  );
}
