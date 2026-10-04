'use client';

// The flow-type migration's report on a phone, shown once: every bucket and
// item it classified, split, corrected or tagged, grouped by kind of change
// in the BASELINE list style. "Got it" marks it reviewed so the Budget page
// stops pointing here.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFlowMigrationReport } from '@/src/shared/hooks/useBudgetMonthState';
import { markFlowMigrationReviewed } from '@/src/shared/firestore/flowMigration';
import { REPORT_KIND_LABEL, type ReportKind } from '@/src/shared/budget/flowMigration';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { CollapsibleGroup } from '@/src/phone/widgets/CollapsibleGroup/CollapsibleGroup';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/MigrationReport/MigrationReport.module.css';

const ORDER: ReportKind[] = ['needs-attention', 'kind-guessed', 'split', 'item-moved', 'bucket-type', 'sign-fixed', 'debt-financing', 'subtype'];

export function MigrationReportScreen() {
  const { user } = useFirebaseUser();
  const router = useRouter();
  const goBack = useGoBack();
  const { data, loading } = useFlowMigrationReport();
  const [busy, setBusy] = useState(false);
  const report = data?.report ?? [];
  const pending = Boolean(data && !data.reviewedAt);

  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`} data-pending={pending || undefined}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={() => goBack('/budget')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="What changed"
      />

      <ScreenState loading={loading} />

      {!loading && (
        <p className={styles.intro}>Income, expenses, savings and transfers are now kept apart. This is everything that was sorted, split or corrected.</p>
      )}
      {!loading && !report.length && <p className={p.empty}>Nothing needed changing.</p>}

      {ORDER.map((kind) => {
        const entries = report.filter((r) => r.kind === kind);
        if (!entries.length) return null;
        return (
          <CollapsibleGroup key={kind} title={REPORT_KIND_LABEL[kind]} count={entries.length} defaultOpen={kind === 'needs-attention'}>
            {entries.map((entry, index) => (
              <div key={`${entry.subject}-${index}`} className={p.row}>
                <span className={p.rowMain}>
                  <span className={p.rowName}>{entry.subject}</span>
                  <span className={styles.detail}>{entry.detail}</span>
                </span>
              </div>
            ))}
          </CollapsibleGroup>
        );
      })}

      {pending && (
        <div className={p.sticky}>
          <button
            type="button"
            className={`${p.fillButton} ${p.bigButton} ${styles.full}`}
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
    </div>
  );
}
