'use client';

import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useLogic } from '@/src/logic/reconciliationHistory/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './ReconciliationHistoryScreen.module.css';

export function ReconciliationHistoryScreen() {
  const strings = useStrings();
  const s = strings.reconciliation;
  const { currency, rows, loading, error, expandedId, toggleExpanded, accountName, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{s.historyTitle}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && rows && rows.length === 0 && <p className={styles.emptyText}>{s.noHistory}</p>}

      {!loading && !error && rows && rows.length > 0 && (
        <div className={styles.list}>
          {rows.map((row) => {
            const expanded = expandedId === row.id;
            const accountIds = Object.keys(row.ledgerBalancesAtTime);
            return (
              <div key={row.id} className={styles.card}>
                <button type="button" className={styles.cardHeader} onClick={() => toggleExpanded(row.id)}>
                  <div className={styles.cardHeaderText}>
                    <span className={styles.cardDate}>{row.performedAt.toDate().toLocaleDateString()}</span>
                    <span className={row.totalGap === 0 ? styles.cardGapZero : styles.cardGap}>
                      {s.gapAtCheckPrefix} {row.totalGap > 0 ? '+' : ''}
                      {formatAmount(row.totalGap)} {currency}
                    </span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
