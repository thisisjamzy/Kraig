'use client';

// The flow-type migration's report, shown once: every bucket and item it
// classified, split, corrected or tagged, grouped by kind of change.
// "Got it" marks it reviewed so the Budget page stops pointing here.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFlowMigrationReport } from '@/src/shared/hooks/useBudgetMonthState';
import { markFlowMigrationReviewed } from '@/src/shared/firestore/flowMigration';
import { REPORT_KIND_LABEL, type ReportKind } from '@/src/shared/budget/flowMigration';
import { ResponsivePage } from '@/src/widgets/Layout/ResponsivePage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './MigrationReport.module.css';

const ORDER: ReportKind[] = ['needs-attention', 'kind-guessed', 'split', 'item-moved', 'bucket-type', 'sign-fixed', 'debt-financing', 'subtype'];

export function MigrationReportScreen() {
  const { user } = useFirebaseUser();
  const router = useRouter();
  const { data, loading } = useFlowMigrationReport();
  const [busy, setBusy] = useState(false);
  const report = data?.report ?? [];

  return (
    <ResponsivePage
      title="What changed in your budget"
      kind="Income, expenses, savings and transfers are now kept apart"
      icon={<ListChecks size={24} strokeWidth={2} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Budget', href: '/budget' }, { label: 'What changed' }]}
      back="/budget"
    >
      <ScreenState loading={loading} />
      {!loading && !report.length && <p className={styles.muted}>Nothing needed changing.</p>}
      {ORDER.map((kind) => {
        const entries = report.filter((r) => r.kind === kind);
        if (!entries.length) return null;
        return (
          <section key={kind} className={styles.section} data-kind={kind}>
            <h2>
              {REPORT_KIND_LABEL[kind]} <span>{entries.length}</span>
            </h2>
            <ul>
              {entries.map((entry, index) => (
                <li key={`${entry.subject}-${index}`}>
                  <strong>{entry.subject}</strong>
                  <span>{entry.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {data && !data.reviewedAt && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !user}
            onClick={async () => {
              if (!user) return;
              setBusy(true);
              await markFlowMigrationReviewed(user.uid);
              router.push('/budget');
            }}
          >
            Got it
          </button>
        </div>
      )}
    </ResponsivePage>
  );
}
