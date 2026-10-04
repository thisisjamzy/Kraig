'use client';

// At most two compact cards at the top of the phone Home, each shown only
// when it applies: this month's budget still waiting for its review, and
// payments ready to confirm. Each opens its own full-screen page.

import Link from 'next/link';
import { CalendarCheck, Send } from 'lucide-react';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { useBudgetMonthDoc } from '@/src/shared/hooks/useBudgetMonthState';
import { useReadyToPay } from '@/src/shared/hooks/useReadyToPay';
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

  if (!showReview && !showReady) return null;

  return (
    <div className={styles.actionCards}>
      {showReview && (
        <div className={styles.actionCard}>
          <span className={styles.summaryIcon}>
            <CalendarCheck size={16} strokeWidth={2} />
          </span>
          <span className={styles.actionCardText}>
            Review {MONTH_NAMES[now.getMonth()]} budget · {lines} {lines === 1 ? 'line' : 'lines'}
          </span>
          <Link href={`/budget/review?month=${month}`} className={styles.actionCardButton}>
            Review
          </Link>
        </div>
      )}
      {showReady && (
        <div className={styles.actionCard}>
          <span className={styles.summaryIcon}>
            <Send size={16} strokeWidth={2} />
          </span>
          <span className={styles.actionCardText}>
            {ready.count} {ready.count === 1 ? 'payment' : 'payments'} ready to confirm · {Math.round(readyTotal).toLocaleString('en-US')}
          </span>
          <Link href="/budget/ready" className={styles.actionCardButton}>
            Open
          </Link>
        </div>
      )}
    </div>
  );
}
