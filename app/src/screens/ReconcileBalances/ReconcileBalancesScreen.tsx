'use client';

import { ChevronLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLogic } from '@/src/logic/reconcileBalances/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import styles from './ReconcileBalancesScreen.module.css';

export function ReconcileBalancesScreen() {
  const strings = useStrings();
  const {
    status,
    results,
    mismatches,
    clean,
    negativeAccounts,
    orphaned,
    totalTransactions,
    totalTransfers,
    selectedIds,
    toggleSelected,
    error,
    checkedAt,
    runAudit,
    applyCorrections,
    goBack,
  } = useLogic();

  const auditing = status === 'auditing';
  const applying = status === 'applying';
  const selectedCount = mismatches.filter((row) => selectedIds.has(row.accountId)).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.reconcile.title}</h1>
      </header>

      {!results && (
        <div className={styles.introCard}>
          <p className={styles.introTitle}>{strings.reconcile.introTitle}</p>
          <p className={styles.introBody}>{strings.reconcile.introBody}</p>
          {error && <p className={styles.errorText}>{error}</p>}
          <button type="button" className={styles.runButton} disabled={auditing} onClick={runAudit}>
            {auditing ? strings.reconcile.runningLabel : strings.reconcile.runButton}
          </button>
        </div>
      )}

      {results && (
        <>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span>{strings.reconcile.summaryChecked}</span>
              <span className={styles.summaryValue}>{results.length}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{strings.reconcile.summaryMismatches}</span>
              <span className={mismatches.length > 0 ? styles.summaryValueDanger : styles.summaryValue}>
                {mismatches.length}
              </span>
            </div>
            <div className={styles.summaryRow}>
              <span>{strings.reconcile.summaryMatched}</span>
              <span className={styles.summaryValue}>{clean.length}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{strings.reconcile.summaryEntries}</span>
              <span className={styles.summaryValue}>
                {totalTransactions} / {totalTransfers}
              </span>
            </div>
            {checkedAt && (
              <p className={styles.checkedAt}>
                {strings.reconcile.checkedAtPrefix} {checkedAt.toLocaleString()}
              </p>
            )}
          </div>

          {status === 'applied' && <p className={styles.appliedNotice}>{strings.reconcile.appliedNotice}</p>}
          {error && <p className={styles.errorText}>{error}</p>}

          {negativeAccounts.length > 0 && (
            <div className={styles.warningCard}>
              <div className={styles.warningHeader}>
                <AlertTriangle size={18} strokeWidth={2} className={styles.warningIcon} />
                <p className={styles.warningTitle}>{strings.reconcile.negativeWarningTitle}</p>
              </div>
              <p className={styles.warningBody}>{strings.reconcile.negativeWarningBody}</p>
            </div>
          )}

          {orphaned.length > 0 && (
            <div className={styles.warningCard}>
              <div className={styles.warningHeader}>
                <AlertTriangle size={18} strokeWidth={2} className={styles.warningIcon} />
                <p className={styles.warningTitle}>{strings.reconcile.orphanedTitle}</p>
              </div>
              <p className={styles.warningBody}>{strings.reconcile.orphanedBody}</p>
              <div className={styles.orphanedList}>
                {orphaned.map((entry, index) => (
                  <div key={`${entry.kind}-${entry.id}-${entry.role}-${index}`} className={styles.orphanedItem}>
                    <span className={styles.orphanedKind}>{entry.kind === 'transfer' ? 'Transfer' : 'Transaction'}</span>
                    <span>
                      {entry.description || '(no description)'} — {formatAmount(entry.amount)}
                    </span>
                    <span className={styles.orphanedReason}>
                      {entry.role === 'from'
                        ? strings.reconcile.orphanedTransferFrom
                        : entry.role === 'to'
                          ? strings.reconcile.orphanedTransferTo
                          : strings.reconcile.orphanedTransactionAccount}
                      : {entry.accountId}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mismatches.length === 0 ? (
            <div className={styles.cleanCard}>
              <CheckCircle2 size={20} strokeWidth={2} className={styles.cleanIcon} />
              <div>
                <p className={styles.cleanTitle}>{strings.reconcile.cleanTitle}</p>
                <p className={styles.cleanBody}>{strings.reconcile.cleanBody}</p>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.listTitle}>{strings.reconcile.mismatchListTitle}</p>
              <div className={styles.list}>
                {mismatches.map((row) => (
                  <label key={row.accountId} className={styles.mismatchRow}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedIds.has(row.accountId)}
                      onChange={() => toggleSelected(row.accountId)}
                    />
                    <div className={styles.mismatchInfo}>
                      <div className={styles.mismatchNameRow}>
                        <span className={styles.mismatchName}>
                          {row.name} {row.archived && <span className={styles.archivedTag}>archived</span>}
                        </span>
                        {row.goesNegative && <span className={styles.negativeBadge}>{strings.reconcile.negativeBadge}</span>}
                      </div>
                      <div className={styles.mismatchFigures}>
                        <span className={styles.figure}>
                          {strings.reconcile.storedLabel}: {formatAmount(row.storedBalance)} {row.currency}
                        </span>
                        <span className={styles.figure}>
                          {strings.reconcile.expectedLabel}: {formatAmount(row.expectedBalance)} {row.currency}
                        </span>
                        <span className={row.difference > 0 ? styles.diffPositive : styles.diffNegative}>
                          {strings.reconcile.differenceLabel}: {row.difference > 0 ? '+' : ''}
                          {formatAmount(row.difference)} {row.currency}
                        </span>
                        <span className={styles.figure}>
                          {row.transactionCount} {strings.reconcile.perRowTransactionsLabel} · {row.transferCount}{' '}
                          {strings.reconcile.perRowTransfersLabel}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {status === 'reviewing' && selectedCount === 0 && <p className={styles.hintText}>{strings.reconcile.noneSelected}</p>}

              <button
                type="button"
                className={styles.applyButton}
                disabled={applying || selectedCount === 0}
                onClick={applyCorrections}
              >
                {applying ? strings.reconcile.applyingLabel : `${strings.reconcile.applyButton} (${selectedCount})`}
              </button>
            </>
          )}

          <button type="button" className={styles.linkButton} disabled={auditing} onClick={runAudit}>
            {strings.reconcile.rerunButton}
          </button>
        </>
      )}
    </div>
  );
}
