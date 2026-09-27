'use client';

// All transactions — exactly Planning's History list (HistoryView), for
// all time (or one month / one backfill batch, see its logic).

import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionHistory/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HistoryView } from '@/src/screens/Planning/HistoryView';
import p from '@/src/screens/Planning/Planning.module.css';
import styles from './AllTransactions.module.css';

export function TransactionHistoryScreen() {
  const t = useLogic();
  return (
    <div className={p.page}>
      <div className={`${p.topBar} ${styles.topBar}`}>
        <button type="button" className={p.roundButton} onClick={t.goBack} aria-label="Back">
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{t.title}</h1>
        <Link href={t.addHref} className={p.roundButton} aria-label="Add transaction">
          <Plus size={20} strokeWidth={2} />
        </Link>
      </div>

      <ScreenState loading={t.loading} error={t.error ? String(t.error) : null} />

      {!t.loading && !t.error && (
        <>
          <HistoryView
            rows={t.rows}
            currency={t.currency}
            fields={t.fields}
            list={t.list}
            stickyTop="env(safe-area-inset-top)"
            emptyText="No transactions recorded yet."
            showYear
          />
          {t.capped && <p className={styles.capped}>Showing your latest transactions. Use Planning’s History tab for earlier months.</p>}
        </>
      )}
    </div>
  );
}
