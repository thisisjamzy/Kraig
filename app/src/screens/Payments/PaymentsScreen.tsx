'use client';

// Payments on tablet and web: one view, Calendar. The payments calendar is
// drawn as the Time calendar (Dreda.figcraft `Calendar / Web`): the type
// tabs over it (Everything, To pay, Overdue, Paid, with counts), then the
// month grid in a white card, each payment a pill on its due day in the
// payment colour (overdue in the danger colour, paid struck through).
// Tapping one opens Mark as paid (a paid one opens its item). Under it,
// Priorities as designed in `Payments / Web / Priorities` (PriorityList).
// The header keeps the month picker and Plan a payment; the four tiles
// stay (Paid, Still to pay, Overdue, Can pay now). Both halves follow
// ?month=.

import { DueTemplates } from '@/src/widgets/DueTemplates/DueTemplates';
import { ChangeDateSheet, movedFromText } from '@/src/widgets/ChangeDate/ChangeDateSheet';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { usePaymentsTab, type MonthPayment } from '@/src/logic/planning/usePaymentsTab';
import { useLogic as usePriorities } from '@/src/logic/priorities/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useMonthParam } from '@/src/shared/navigation/useMonthParam';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { isoDay, type CalItem } from '@/src/viewmodels/calendarItems';
import { monthTitle } from '@/src/viewmodels/planning';
import { TopBarActions, TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { formatAmountValue } from '@/src/widgets/Database/format';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { MonthGrid } from '@/src/widgets/TimeCalendar/MonthGrid';
import { PriorityList } from './PriorityList';
import styles from './Payments.module.css';

const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
type Filter = 'all' | 'open' | 'overdue' | 'paid';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'open', label: 'To pay' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
];

function toItem(x: MonthPayment): CalItem {
  const day = isoDay(x.due);
  return {
    key: x.id,
    title: `${x.name} · ${formatAmountValue(Math.round(x.status === 'paid' ? x.paid : x.remaining))}${x.movedFrom ? ` · ${movedFromText(x.movedFrom)}` : ''}`,
    kind: 'payment',
    start: null,
    end: null,
    allDay: true,
    day,
    free: false,
    done: x.status === 'paid',
    project: x.bucketName,
    attendees: [],
    meeting: false,
    taskId: null,
    href: `/budget/item/${x.bucketId}/${x.itemId}`,
    late: x.status === 'overdue',
  };
}

export function PaymentsScreen() {
  const [month, setMonth] = useMonthParam();
  const [filter, setFilter] = useState<Filter>('all');
  const data = useMonthBudget(month);
  const p = usePaymentsTab(month, data, null);
  // "Change date" (owner, 23 Nov 2026): from the payment's sheet.
  const [moving, setMoving] = useState<MonthPayment | null>(null);
  const priorities = usePriorities();
  const formLink = useFormLink();
  const router = useRouter();
  const { deviceClass } = useLayout();
  const monthName = monthTitle(month).split(' ')[0];

  const overdue = p.open.filter((x) => x.status === 'overdue');
  const stillToPay = p.open.reduce((sum, x) => sum + x.remaining, 0);
  const paidTotal = p.paid.reduce((sum, x) => sum + x.paid, 0) + p.open.reduce((sum, x) => sum + x.paid, 0);
  const lastPaid = [...p.paid].sort((a, b) => b.due.getTime() - a.due.getTime())[0];
  const nextOpen = p.open.filter((x) => x.status !== 'overdue').sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  const n = (k: number, one: string) => `${k} ${k === 1 ? one : `${one}s`}`;
  const accountName = useMemo(() => new Map(p.accounts.map((a) => [a.id, a.name])), [p.accounts]);

  const all = useMemo(() => [...p.open, ...p.paid], [p.open, p.paid]);
  const counts: Record<Filter, number> = { all: all.length, open: p.open.length, overdue: overdue.length, paid: p.paid.length };
  const shown = filter === 'all' ? all : filter === 'open' ? p.open : filter === 'overdue' ? overdue : p.paid;
  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const x of shown) {
      const item = toItem(x);
      map.set(item.day, [...(map.get(item.day) ?? []), item]);
    }
    return map;
  }, [shown]);
  const byId = useMemo(() => new Map(all.map((x) => [x.id, x])), [all]);
  const today = isoDay(new Date());

  return (
    <NotionPage
      title="Payments"
      sub={`${monthName} · ${n(p.open.length, 'payment')} still open, ${overdue.length} overdue`}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Payments' }]}
      properties={[
        { id: 'paid', label: `Paid · ${n(p.paid.length, 'payment')}`, display: formatAmountValue(Math.round(paidTotal)), sub: lastPaid ? `Last: ${lastPaid.name} on ${SHORT.format(lastPaid.due)}` : 'Nothing paid yet' },
        { id: 'still', label: `Still to pay · ${n(p.open.length, 'payment')}`, display: formatAmountValue(Math.round(stillToPay)), sub: nextOpen ? `Next: ${nextOpen.name} on ${SHORT.format(nextOpen.due)}` : 'Nothing left this month' },
        {
          id: 'overdue',
          label: `Overdue · ${n(overdue.length, 'payment')}`,
          display: formatAmountValue(Math.round(overdue.reduce((sum, x) => sum + x.remaining, 0))),
          tone: overdue.length ? 'bad' : 'neutral',
          sub: overdue[0] ? `${overdue[0].name} was due on ${SHORT.format(overdue[0].due)}` : 'Nothing late',
        },
        { id: 'now', label: 'Can pay now', display: formatAmountValue(Math.round(priorities.totals.canPayNow)), sub: 'Covered by money already received' },
      ]}
    >
      <TopBarControls>
        <MonthPicker value={month} onChange={setMonth} />
      </TopBarControls>
      <TopBarActions>
        <Link href={formLink('basket-item')} scroll={false} className={styles.outlineButton}>
          Plan a payment
        </Link>
      </TopBarActions>

      <DueTemplates />
      <div className={styles.kindTabs} role="tablist" aria-label="Which payments">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
            <CalendarDays size={16} strokeWidth={2} aria-hidden />
            {f.label} <span>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {data.loading ? (
        <ScreenState loading />
      ) : (
        <section className={styles.calendarCard} aria-label={`Payments in ${monthTitle(month)}`}>
          <MonthGrid
            selected={`${month}-01`}
            today={today}
            itemsOn={(iso) => byDay.get(iso) ?? []}
            onOpen={(item) => {
              const x = byId.get(item.key);
              if (!x) return;
              if (x.status === 'paid') router.push(`/budget/item/${x.bucketId}/${x.itemId}?month=${month}`);
              else p.startPaying(x);
            }}
            onDay={() => undefined}
            compact={deviceClass === 'medium'}
          />
        </section>
      )}

      <section className={styles.priorities} aria-label="Priorities">
        <h2 className={styles.sectionTitle}>Priorities</h2>
        <PriorityList v={priorities} walletName={(id) => (id ? (accountName.get(id) ?? null) : null)} />
      </section>

      {p.paying && (
        <Modal title="Mark as paid" onClose={p.cancelPaying}>
          <div className={styles.sheet}>
            <p>
              {p.paying.name} · {formatAmountValue(p.paying.remaining || p.paying.amount)} {p.currency}, recorded today against {monthTitle(month)}.
            </p>
            <label>
              Amount
              <input inputMode="decimal" value={p.payAmount} onChange={(e) => p.setPayAmount(e.target.value)} />
            </label>
            <label>
              {p.paying.categoryType === 'Income' ? 'Received into' : p.paying.categoryType === 'Savings' ? 'Saved into' : 'Paid from'}
              <select value={p.payAccountId} onChange={(e) => p.setPayAccountId(e.target.value)}>
                {p.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {p.error && <p className={styles.error}>{p.error}</p>}
            <button type="button" className={styles.primary} disabled={!p.payAccountId || !(Number(p.payAmount) > 0) || p.busy} onClick={p.confirmPaid}>
              {p.busy ? 'Saving…' : 'Confirm payment'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setMoving(p.paying);
                p.cancelPaying();
              }}
            >
              Change date
            </button>
          </div>
        </Modal>
      )}
      {moving && (
        <ChangeDateSheet
          name={moving.name}
          due={moving.due}
          recurring={moving.recurring}
          busy={p.busy}
          error={p.error}
          onClose={() => setMoving(null)}
          onSave={async (to, scope) => {
            if (await p.changeDate(moving, to, scope)) setMoving(null);
          }}
        />
      )}
    </NotionPage>
  );
}
