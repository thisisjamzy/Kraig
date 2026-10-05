'use client';

// Planning > Payments — "what's coming and when?": the month on a black
// calendar (a dot per payment: blue upcoming, green paid, red overdue; up
// to 3 a day) and the payments below — tap a day to narrow the list to it.
// Paid ones fold into "Paid this month".

import { ChevronLeft, ChevronRight, CircleCheck, X } from 'lucide-react';
import { usePaymentsTab, type MonthPayment } from '@/src/logic/planning/usePaymentsTab';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { Modal } from '@/src/widgets/Modal/Modal';
import { money, monthTitle, shiftMonth, dayMonth } from '@/src/viewmodels/planning';
import { IconCircle } from '@/src/phone/screens/Planning/PlanningParts';
import styles from '@/src/phone/screens/Planning/Planning.module.css';
import tab from '@/src/phone/screens/Planning/PlanningTabs.module.css';
import { Fragment } from 'react';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import wide from '@/src/phone/screens/Planning/Planning.wide.module.css';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PaymentCard({ payment, currency, onPay }: { payment: MonthPayment; currency: string; onPay: () => void }) {
  return (
    <article className={tab.payCard} data-status={payment.status}>
      <IconCircle type={payment.categoryType} />
      <div className={tab.payMain}>
        <span className={tab.payName}>{payment.name}</span>
        <span className={tab.payLine}>
          {payment.frequency} · {dayMonth(payment.due)}
        </span>
        <span className={tab.payLine}>{payment.method}</span>
        <span className={tab.payChips}>
          <span className={styles.chip}>{payment.bucketName}</span>
          {payment.status === 'overdue' && (
            <span className={styles.chip} data-tone="over">
              Overdue
            </span>
          )}
          {payment.status === 'paid' && (
            <span className={styles.chip} data-tone="neutral">
              <CircleCheck size={11} strokeWidth={2.5} aria-hidden /> Paid
            </span>
          )}
        </span>
      </div>
      <div className={tab.paySide}>
        <span className={tab.payAmount}>
          {payment.categoryType === 'Income' ? '+' : '-'}
          {money(payment.amount)} {currency}
        </span>
        {payment.status !== 'paid' && (
          <button type="button" className={styles.textButton} data-tone={payment.status} onClick={onPay}>
            Mark as paid
          </button>
        )}
      </div>
    </article>
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
  const inShell = useHasTopBar();
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = first.getDay();
  const gridStart = new Date(y, m - 1, 1 - lead);
  const weeks = Math.ceil((lead + new Date(y, m, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const todayKey = key(new Date());
  const selectedLabel = p.selectedDay
    ? dayMonth(new Date(`${p.selectedDay}T00:00:00`))
    : null;

  // Medium screens and up: the calendar card on the left, the payments
  // for the chosen day or month beside it. Fragments on a phone.
  const Column = inShell ? 'div' : Fragment;
  const col = (className: string) => (inShell ? { className } : {});

  return (
    <>
      <Column {...col(wide.split)}>
      <Column {...col(wide.left)}>
      <section className={tab.calendar} aria-label={`Payments in ${monthTitle(month)}`}>
        <header className={tab.calHead}>
          <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <span>{monthTitle(month)}</span>
          <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        </header>
        <div className={tab.calGrid}>
          {WEEKDAYS.map((d) => (
            <span key={d} className={tab.calWeekday}>
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const k = key(d);
            const inMonth = d.getMonth() === m - 1;
            const dots = (p.dotsByDay.get(k) ?? []).slice(0, 3);
            return (
              <button
                key={k}
                type="button"
                className={tab.calDay}
                data-outside={!inMonth || undefined}
                data-today={k === todayKey || undefined}
                aria-pressed={p.selectedDay === k}
                disabled={!inMonth}
                onClick={() => p.pickDay(k)}
                aria-label={`${d.getDate()}${dots.length ? `, ${dots.length} ${dots.length === 1 ? 'payment' : 'payments'}` : ''}`}
              >
                <span className={tab.calNum}>{d.getDate()}</span>
                <span className={tab.calDots} aria-hidden>
                  {dots.map((status, i) => (
                    <span key={i} data-status={status} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <ul className={tab.calLegend}>
          <li>
            <span data-status="upcoming" /> Upcoming
          </li>
          <li>
            <span data-status="paid" /> Paid
          </li>
          <li>
            <span data-status="overdue" /> Overdue
          </li>
        </ul>
      </section>
      </Column>
      <Column {...col(wide.right)}>

      <div className={tab.sectionHead}>
        <h2 className={tab.sectionTitle}>{selectedLabel ? `Payments on ${selectedLabel}` : 'Upcoming payments'}</h2>
        {selectedLabel && (
          <button type="button" className={styles.textButton} onClick={p.clearDay}>
            Clear
          </button>
        )}
      </div>

      {p.bucketName && (
        <div className={tab.chips}>
          <button type="button" aria-pressed="true" onClick={() => setBucket(null)} aria-label={`Clear filter: ${p.bucketName}`}>
            {p.bucketName}
            <X size={14} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      )}

      {p.open.length === 0 ? (
        <p className={styles.empty}>
          {p.payments.length === 0
            ? 'No payments scheduled this month. Give a basket item a due date to see it here.'
            : selectedLabel
              ? 'Nothing left to pay on this day.'
              : 'Everything this month is paid.'}
        </p>
      ) : (
        <div className={tab.cardList}>
          {p.open.map((payment) => (
            <PaymentCard key={payment.id} payment={payment} currency={p.currency} onPay={() => p.startPaying(payment)} />
          ))}
        </div>
      )}

      {p.paid.length > 0 && (
        <details className={tab.paidGroup}>
          <summary>
            Paid this month
            <span>{p.paid.length}</span>
          </summary>
          <div className={tab.cardList}>
            {p.paid.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} currency={p.currency} onPay={() => undefined} />
            ))}
          </div>
        </details>
      )}
      </Column>
      </Column>

      {p.paying && (
        <Modal title="Mark as paid" onClose={p.cancelPaying}>
          <p className={tab.sheetHint}>
            {p.paying.name} · {money(p.paying.amount)} {p.currency}, recorded today against {monthTitle(month)}.
          </p>
          <label className={tab.field}>
            {p.paying.categoryType === 'Income' ? 'Received into' : p.paying.categoryType === 'Savings' ? 'Saved into' : 'Paid from'}
            <select value={p.payAccountId} onChange={(e) => p.setPayAccountId(e.target.value)}>
              {p.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {p.error && <p className={tab.error}>{p.error}</p>}
          <button type="button" className={`${styles.fillButton} ${tab.fullButton}`} disabled={!p.payAccountId || p.busy} onClick={p.confirmPaid}>
            {p.busy ? 'Saving…' : 'Confirm payment'}
          </button>
        </Modal>
      )}
    </>
  );
}
