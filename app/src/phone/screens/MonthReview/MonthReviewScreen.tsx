'use client';

// Review the month on a phone: a full-screen page in the BASELINE list
// style. Income, Expenses, Savings and Transfers each fold open as a group
// of this month's lines (amount and date editable for this month only;
// variable expenses can roll their unused amount over). The bottom bar
// shows the resulting Left to plan and one button, Confirm month, which
// saves and marks the month reviewed.

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/monthReview/useLogic';
import { FLOW_LABEL, FLOW_TYPES } from '@/src/shared/budget/flow';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { CollapsibleGroup } from '@/src/phone/widgets/CollapsibleGroup/CollapsibleGroup';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/MonthReview/MonthReview.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function MonthReviewScreen() {
  const v = useLogic();
  const router = useRouter();
  const goBack = useGoBack();
  const budgetHref = `/budget?month=${v.month}`;

  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={() => goBack(budgetHref)} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title={`Review ${v.title}`}
      />

      <ScreenState loading={v.loading} />

      {!v.loading && (
        <>
          <p className={styles.intro}>Set up from your recurring items. Changes here apply to this month only.</p>

          {FLOW_TYPES.map((type) => {
            const lines = v.rows[type];
            return (
              <CollapsibleGroup
                key={type}
                title={FLOW_LABEL[type]}
                count={lines.length}
                total={`${money(v.sectionTotal(type))} ${v.currency}`}
                defaultOpen={lines.length > 0}
              >
                {lines.length === 0 ? (
                  <p className={styles.emptyRow}>No {FLOW_LABEL[type].toLowerCase()} lines this month.</p>
                ) : (
                  lines.map((line) => (
                    <div key={line.key} className={p.row}>
                      <span className={p.rowMain}>
                        <span className={p.rowName}>{line.name}</span>
                        <span className={p.rowNote}>{line.bucketName}</span>
                        {v.carriedFor(line) > 0 && <span className={p.rowMethod}>+{money(v.carriedFor(line))} rolled over from last month</span>}
                        <input
                          type="date"
                          className={styles.field}
                          value={v.dateText(line)}
                          onChange={(e) => v.setDate(line, e.target.value)}
                          aria-label={`${line.name} ${type === 'Income' ? 'expected date' : type === 'Transfer' ? 'date' : 'due date'}`}
                        />
                        {type === 'Expense' && line.expenseKind === 'variable' && (
                          <label className={styles.toggle}>
                            <input type="checkbox" checked={v.rolloverOf(line)} onChange={(e) => v.setRollover(line, e.target.checked)} />
                            <span>Roll over unused amount</span>
                          </label>
                        )}
                      </span>
                      <label className={p.rowSide}>
                        <span className={p.srOnly}>{line.name} amount</span>
                        <input inputMode="decimal" className={styles.amount} value={v.amountText(line)} onChange={(e) => v.setAmount(line, e.target.value)} />
                        <span className={p.rowWhen}>{v.currency}</span>
                      </label>
                    </div>
                  ))
                )}
                {type === 'Transfer' && v.fees > 0 && (
                  <div className={p.row}>
                    <span className={p.rowMain}>
                      <span className={p.rowNote}>Fees (counted as expenses)</span>
                    </span>
                    <span className={p.rowSide}>
                      <span className={p.rowAmount}>
                        {money(v.fees)} {v.currency}
                      </span>
                    </span>
                  </div>
                )}
              </CollapsibleGroup>
            );
          })}

          <p className={styles.explain}>Left to plan is expected income minus planned expenses and savings. Transfers aren&apos;t counted; their fees are.</p>

          {v.error && (
            <p className={styles.error} role="alert">
              {v.error}
            </p>
          )}

          <div className={p.sticky}>
            <span className={p.stickyAmount}>
              <span className={p.stickyLabel}>Left to plan</span>
              <span className={p.stickyValue} data-tone={v.leftToPlan < 0 ? 'bad' : undefined}>
                {money(v.leftToPlan)}
                <small>{v.currency}</small>
              </span>
            </span>
            <button
              type="button"
              className={`${p.fillButton} ${p.bigButton}`}
              disabled={v.busy}
              onClick={async () => {
                if (await v.confirm()) router.push(budgetHref);
              }}
            >
              {v.busy ? 'Saving…' : 'Confirm month'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
