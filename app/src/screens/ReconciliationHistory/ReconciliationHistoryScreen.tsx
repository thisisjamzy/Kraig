'use client';

import { Fragment } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useLogic } from '@/src/logic/reconciliationHistory/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from './ReconciliationHistoryScreen.module.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthTitle = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export function ReconciliationHistoryScreen() {
  const strings = useStrings();
  const s = strings.reconciliation;
  const { currency, rows, loading, error, expandedId, toggleExpanded, accountName, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={s.historyTitle}
      />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && rows && rows.length === 0 && <p className={styles.emptyText}>{s.noHistory}</p>}

      {!loading && !error && rows && rows.length > 0 && (
        <div className={styles.list}>
          {rows.map((row, index) => {
            const expanded = expandedId === row.id;
            // A heading per month: how many checks, and what they recorded as unaccounted.
            const monthKey = row.month ?? monthOf(row.performedAt.toDate());
            const newMonth = index === 0 || (rows[index - 1].month ?? monthOf(rows[index - 1].performedAt.toDate())) !== monthKey;
            const inMonth = rows.filter((r) => (r.month ?? monthOf(r.performedAt.toDate())) === monthKey);
            const recorded = inMonth.reduce((sum, r) => sum + r.totalGap, 0);
            const accountIds = Object.keys(row.ledgerBalancesAtTime);
            return (
              <Fragment key={row.id}>
              {newMonth && (
                <h2 className={styles.monthHead}>
                  {monthTitle(monthKey)} · {inMonth.length} {inMonth.length === 1 ? 'check' : 'checks'} · {formatAmount(recorded)} {currency} recorded as unaccounted
                </h2>
              )}
              <div className={styles.card}>
                <button type="button" className={styles.cardHeader} onClick={() => toggleExpanded(row.id)}>
                  <div className={styles.cardHeaderText}>
                    <span className={styles.cardDate}>{row.performedAt.toDate().toLocaleDateString()}</span>
                    <span className={row.totalGap === 0 ? styles.cardGapZero : styles.cardGap}>
                      {s.gapAtCheckPrefix} {row.totalGap > 0 ? '+' : ''}
                      {formatAmount(row.totalGap)} {currency}
                    </span>
                    {row.unaccountedBefore !== undefined && row.unaccountedAfter !== undefined && (
                      <span className={styles.cardGapZero}>
                        Unaccounted {formatAmount(row.unaccountedBefore)} before, {formatAmount(row.unaccountedAfter)} after
                      </span>
                    )}
                  </div>
                  {expanded ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
                </button>

                {expanded && (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{s.columnAccount}</th>
                          <th className={styles.numCol}>{s.columnLedger}</th>
                          <th className={styles.numCol}>{s.columnReported}</th>
                          <th className={styles.numCol}>{s.columnDifference}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountIds.map((accountId) => {
                          const ledger = row.ledgerBalancesAtTime[accountId] ?? 0;
                          const reported = row.reportedBalances[accountId] ?? 0;
                          return (
                            <tr key={accountId}>
                              <td>{accountName(accountId)}</td>
                              <td className={styles.numCol}>{formatAmount(ledger)}</td>
                              <td className={styles.numCol}>{formatAmount(reported)}</td>
                              <td className={styles.numCol}>{formatAmount(ledger - reported)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
