'use client';

// Review the month: Income, Expenses, Savings and Transfers each as its
// own table of this month's lines (amount and date editable for this month
// only), a footer total per section, and the resulting Left to plan.
// Confirm saves and marks the month reviewed.

import { useRouter } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';
import { useLogic } from '@/src/logic/monthReview/useLogic';
import { FLOW_LABEL, FLOW_TYPES } from '@/src/shared/budget/flow';
import { ResponsivePage } from '@/src/phone/widgets/Layout/ResponsivePage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from '@/src/phone/screens/MonthReview/MonthReview.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function MonthReviewScreen() {
  const v = useLogic();
  const router = useRouter();

  return (
    <ResponsivePage
      title={`Review ${v.title}`}
      kind="Set up from your recurring items. Changes here apply to this month only."
      icon={<CalendarCheck size={24} strokeWidth={2} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Budget', href: `/budget?month=${v.month}` }, { label: `Review ${v.title}` }]}
      back={`/budget?month=${v.month}`}
    >
      <ScreenState loading={v.loading} />
      {!v.loading &&
        FLOW_TYPES.map((type) => {
          const lines = v.rows[type];
          return (
            <section key={type} className={styles.section} aria-label={FLOW_LABEL[type]}>
              <h2>
                {FLOW_LABEL[type]} <span>{lines.length}</span>
              </h2>
              {lines.length === 0 ? (
                <p className={styles.empty}>No {FLOW_LABEL[type].toLowerCase()} lines this month.</p>
              ) : (
                <div className={styles.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Bucket</th>
                        <th>{type === 'Income' ? 'Expected date' : type === 'Transfer' ? 'Date' : 'Due date'}</th>
                        <th data-align="right">{type === 'Income' ? 'Expected' : type === 'Transfer' ? 'Amount' : 'Planned'}</th>
                        {type === 'Expense' && <th>Roll over unused amount</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.key}>
                          <td data-label="Name">
                            <strong>{line.name}</strong>
                            {v.carriedFor(line) > 0 && <span className={styles.note}>+{money(v.carriedFor(line))} rolled over from last month</span>}
                          </td>
                          <td data-label="Bucket">{line.bucketName}</td>
                          <td data-label="Date">
                            <input type="date" value={v.dateText(line)} onChange={(e) => v.setDate(line, e.target.value)} aria-label={`${line.name} date`} />
                          </td>
                          <td data-label="Amount" data-align="right">
                            <input inputMode="decimal" value={v.amountText(line)} onChange={(e) => v.setAmount(line, e.target.value)} aria-label={`${line.name} amount`} />
                          </td>
                          {type === 'Expense' && (
                            <td data-label="Roll over">
                              {line.expenseKind === 'variable' ? (
                                <label className={styles.toggle}>
                                  <input type="checkbox" checked={v.rolloverOf(line)} onChange={(e) => v.setRollover(line, e.target.checked)} />
                                  <span>Roll over</span>
                                </label>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Total</td>
                        <td data-align="right">
                          {money(v.sectionTotal(type))} {v.currency}
                        </td>
                        {type === 'Expense' && <td />}
                      </tr>
                      {type === 'Transfer' && v.fees > 0 && (
                        <tr>
                          <td colSpan={3}>Fees (counted as expenses)</td>
                          <td data-align="right">
                            {money(v.fees)} {v.currency}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      {!v.loading && (
        <div className={styles.footer}>
          <p>
            Left to plan{' '}
            <strong data-tone={v.leftToPlan < 0 ? 'bad' : undefined}>
              {money(v.leftToPlan)} {v.currency}
            </strong>
            <span>Expected income minus planned expenses and savings. Transfers aren&apos;t counted; their fees are.</span>
          </p>
          {v.error && (
            <p className={styles.error} role="alert">
              {v.error}
            </p>
          )}
          <button
            type="button"
            className={styles.primary}
            disabled={v.busy}
            onClick={async () => {
              if (await v.confirm()) router.push(`/budget?month=${v.month}`);
            }}
          >
            {v.busy ? 'Saving…' : 'Confirm month'}
          </button>
        </div>
      )}
    </ResponsivePage>
  );
}
