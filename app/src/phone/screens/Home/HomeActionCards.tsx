'use client';

// At most two compact cards at the top of the phone Home, each shown only
// when it applies: this month's budget still waiting for its review, and
// payments ready to confirm. Each opens its own full-screen page, and each
// can be dismissed (close button or swipe, with Undo) until its content
// changes: a new month to review, or a new payment ready
// (src/shared/settings/dismissals.ts). Dismissing never hides the items
// themselves; they stay in Notifications, Ready to pay and Budget.

import Link from 'next/link';
import { CalendarCheck, Send } from 'lucide-react';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { useBudgetMonthDoc } from '@/src/shared/hooks/useBudgetMonthState';
import { useReadyToPay } from '@/src/shared/hooks/useReadyToPay';
import { useDismissedCard } from '@/src/shared/hooks/useDismissedCard';
import { DismissibleCard } from '@/src/phone/widgets/DismissibleCard/DismissibleCard';
import styles from '@/src/phone/screens/Home/HomeScreen.module.css';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function HomeActionCards() {
  const now = new Date();
  const month = monthKeyOf(now);
  const { data: monthDoc } = useBudgetMonthDoc(month);
  const ready = useReadyToPay();

  const counts = monthDoc?.counts;
  const lines = counts ? counts.income + counts.expense + counts.savings + counts.transfer : 0;
  const showReview = Boolean(monthDoc && !monthDoc.reviewedAt && !monthDoc.bannerDismissedAt && lines > 0);
  const readyTotal = ready.entries.reduce((sum, e) => sum + e.amount + (e.fee ?? 0), 0);
  const showReady = !ready.loading && ready.count > 0;
  const review = useDismissedCard('review', showReview ? { key: `review:${month}` } : null);
  const readyCard = useDismissedCard('readyToPay', showReady ? { key: 'readyToPay', ids: ready.entries.map((e) => e.id) } : null);

  if ((!showReview || review.hidden) && (!showReady || readyCard.hidden)) return null;

  return (
    <div className={styles.actionCards}>
      {showReview && !review.hidden && (
        <DismissibleCard className={styles.actionCard} label="the budget review card" onDismiss={() => review.dismiss('Review card hidden. The budget still needs its review.')}>
          <span className={styles.summaryIcon}>
            <CalendarCheck size={16} strokeWidth={2} />
          </span>
          <span className={styles.actionCardText}>
            Review {MONTH_NAMES[now.getMonth()]} budget · {lines} {lines === 1 ? 'line' : 'lines'}
          </span>
          <Link href={`/budget/review?month=${month}`} className={styles.actionCardButton}>
            Review
          </Link>
        </DismissibleCard>
      )}
      {showReady && !readyCard.hidden && (
        <DismissibleCard className={styles.actionCard} label="the ready to pay card" onDismiss={() => readyCard.dismiss('Card hidden. The payments stay in Ready to pay.')}>
          <span className={styles.summaryIcon}>
            <Send size={16} strokeWidth={2} />
          </span>
          <span className={styles.actionCardText}>
            {ready.count} {ready.count === 1 ? 'payment' : 'payments'} ready to confirm · {Math.round(readyTotal).toLocaleString('en-US')}
          </span>
          <Link href="/budget/ready" className={styles.actionCardButton}>
            Open
          </Link>
        </DismissibleCard>
      )}
    </div>
  );
}
