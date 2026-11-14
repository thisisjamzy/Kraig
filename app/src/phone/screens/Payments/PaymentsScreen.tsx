'use client';

// Payments on a phone: one view, Calendar, as on the web. A back button,
// the title, "How this is ordered" and "+" (plan a payment), then the
// payments month drawn as Dreda.figcraft `Calendar / Phone`
// (PaymentsCalendar: marks under days with payments, the chosen day's
// payments below; overdue in the danger colour), and under it the
// priorities: what to pay next and where the money runs out. Tapping an
// open payment opens Mark as paid. Both halves follow ?month=.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Info, Plus } from 'lucide-react';
import { usePaymentsTab } from '@/src/logic/planning/usePaymentsTab';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useMonthParam } from '@/src/shared/navigation/useMonthParam';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { monthTitle, shiftMonth } from '@/src/viewmodels/planning';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PaymentsCalendar } from './PaymentsCalendar';
import { HowOrdered, PrioritiesBody } from '@/src/phone/screens/Plans/PrioritiesScreen';
import styles from './PaymentsScreen.module.css';

const amount = (n: number) => Math.round(n).toLocaleString('en-US');

export function PaymentsScreen() {
  const [month, setMonth] = useMonthParam();
  const [howOpen, setHowOpen] = useState(false);
  const data = useMonthBudget(month);
  const p = usePaymentsTab(month, data, null);
  const formLink = useFormLink();
  const goBack = useGoBack();
  const router = useRouter();

  const all = useMemo(() => [...p.open, ...p.paid], [p.open, p.paid]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.round} onClick={() => goBack('/budget')} aria-label="Back">
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Payments</h1>
        <button type="button" className={styles.round} onClick={() => setHowOpen(true)} aria-label="How priorities are ordered">
          <Info size={18} strokeWidth={2} />
        </button>
        <Link href={formLink('basket-item')} className={styles.round} aria-label="Plan a payment">
          <Plus size={20} strokeWidth={2} />
        </Link>
      </header>
      {howOpen && <HowOrdered onClose={() => setHowOpen(false)} />}

      {data.loading ? (
        <ScreenState loading />
      ) : (
        <PaymentsCalendar
          month={month}
          onMonth={(delta) => setMonth(shiftMonth(month, delta))}
          payments={all}
          onOpen={(x) => (x.status === 'paid' ? router.push(`/budget/item/${x.bucketId}/${x.itemId}?month=${month}`) : p.startPaying(x))}
        />
      )}

      <section className={styles.priorities} aria-label="Priorities">
        <h2 className={styles.sectionTitle}>Priorities</h2>
        <PrioritiesBody />
      </section>

      {p.paying && (
        <Modal title="Mark as paid" onClose={p.cancelPaying}>
          <div className={styles.sheet}>
            <p>
              {p.paying.name} · {amount(p.paying.remaining || p.paying.amount)} {p.currency}, recorded today against {monthTitle(month)}.
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
          </div>
        </Modal>
      )}
    </div>
  );
}
