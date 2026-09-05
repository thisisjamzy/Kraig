'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogic } from '@/src/logic/reconciliation/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './ReconciliationScreen.module.css';

export function ReconciliationScreen() {
  const strings = useStrings();
  const s = strings.reconciliation;
  const {
    currency,
    unaccountedBalance,
    accounts,
    explained,
    explainedLoading,
    reconcileOpen,
    openReconcile,
    closeReconcile,
    reportedByAccountId,
    setReportedValue,
    totalLedger,
    totalReported,
    liveGap,
    saving,
    saveError,
    justSaved,
    handleSaveReconciliation,
    openHistory,
    goBack,
    loading,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{s.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <>
          <div className={styles.gapCard}>
            <span className={styles.gapLabel}>{s.unaccountedLabel}</span>
            <span className={unaccountedBalance === 0 ? styles.gapValueZero : styles.gapValue}>
              {unaccountedBalance > 0 ? '+' : ''}
              {formatAmount(unaccountedBalance)} {currency}
            </span>
            <p className={styles.gapExplainer}>
              {unaccountedBalance > 0 ? s.gapPositiveExplainer : unaccountedBalance < 0 ? s.gapNegativeExplainer : s.gapZeroExplainer}
            </p>
          </div>

          {justSaved && <p className={styles.savedNotice}>{s.savedNotice}</p>}

          {!reconcileOpen ? (
            <button type="button" className={styles.primaryButton} onClick={openReconcile}>
              {s.reconcileNowButton}
            </button>
          ) : (
            <div className={styles.reconcileCard}>
              <h2 className={styles.reconcileTitle}>{s.reconcileNowTitle}</h2>
              <p className={styles.reconcileHint}>{s.reconcileNowHint}</p>

              <div className={styles.accountList}>
                {accounts.map((account) => (
                  <div key={account.id} className={styles.accountRow}>
                    <div className={styles.accountInfo}>
                      <span className={styles.accountName}>{account.name}</span>
                      <span className={styles.accountLedger}>
                        {s.ledgerPrefix} {formatAmount(account.currentBalance)} {account.currency}
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={styles.reportedInput}
                      value={reportedByAccountId[account.id] ?? ''}
                      onChange={(event) => setReportedValue(account.id, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className={styles.totalsRow}>
                <span>{s.totalLedgerLabel}</span>
                <span>
                  {formatAmount(totalLedger)} {currency}
                </span>
              </div>
              <div className={styles.totalsRow}>
                <span>{s.totalReportedLabel}</span>
                <span>
                  {formatAmount(totalReported)} {currency}
                </span>
              </div>
              <div className={styles.totalsRow}>
                <span>{s.gapLabel}</span>
                <span className={liveGap === 0 ? undefined : styles.gapHighlight}>
                  {liveGap > 0 ? '+' : ''}
                  {formatAmount(liveGap)} {currency}
                </span>
              </div>

              {saveError && <p className={styles.errorText}>{saveError}</p>}

              <div className={styles.reconcileActions}>
                <button type="button" className={styles.cancelButton} onClick={closeReconcile} disabled={saving}>
                  {strings.common.cancel}
                </button>
                <button type="button" className={styles.saveButton} onClick={handleSaveReconciliation} disabled={saving}>
                  {saving ? s.saving : s.saveReconciliation}
                </button>
              </div>
            </div>
          )}

          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>{s.explainedTitle}</h2>
            <button type="button" className={styles.linkButton} onClick={openHistory}>
              {s.viewHistory}
            </button>
          </div>

          <ScreenState loading={explainedLoading} />

          {!explainedLoading && (!explained || explained.length === 0) && (
            <p className={styles.emptyText}>{s.noExplained}</p>
          )}

          {!explainedLoading && explained && explained.length > 0 && (
            <div className={styles.explainedList}>
              {explained.map((t) => (
                <div key={t.id} className={styles.explainedRow}>
                  <div className={styles.explainedInfo}>
                    <span className={styles.explainedDescription}>{t.description}</span>
                    <span className={styles.explainedDate}>{t.date.toDate().toLocaleDateString()}</span>
                  </div>
                  <span className={t.direction === 'Inflow' ? styles.explainedAmountIn : styles.explainedAmountOut}>
                    {t.direction === 'Inflow' ? '+' : '-'}
                    {formatAmount(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button type="button" className={styles.historyButton} onClick={openHistory}>
            {s.viewHistory}
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}
