'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogic } from '@/src/logic/reconciliation/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { WindowPicker } from '@/src/widgets/WindowPicker/WindowPicker';
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
    windowPresets,
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    window: span,
    isNow,
    asOfLoading,
    asOfError,
    ledgerOf,
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
    clearOpen,
    openClear,
    closeClear,
    clearing,
    clearError,
    clearedAmount,
    lastClear,
    handleClearUnaccounted,
    openHistory,
    goBack,
    loading,
  } = useLogic();
  const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={s.title}
      />

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
          {clearedAmount !== null && (
            <p className={styles.savedNotice}>
              Cleared {formatAmount(clearedAmount)} {currency}. Your wallets are unchanged.
            </p>
          )}

          {/* Writing off the unaccounted balance: back to 0, nothing moves
              into or out of a wallet, and the balance audit agrees. */}
          {unaccountedBalance !== 0 && !reconcileOpen && !clearOpen && (
            <button type="button" className={styles.clearButton} onClick={openClear}>
              Clear unaccounted balance
            </button>
          )}
          {clearOpen && (
            <div className={styles.reconcileCard}>
              <h2 className={styles.reconcileTitle}>Clear the unaccounted balance?</h2>
              <p className={styles.reconcileHint}>
                {formatAmount(unaccountedBalance)} {currency} is written off and the unaccounted balance goes back to 0. No money moves into or out of
                your wallets, and checking balances will not try to put it back. Past checks stay in the history.
              </p>
              {clearError && <p className={styles.errorText}>{clearError}</p>}
              <div className={styles.reconcileActions}>
                <button type="button" className={styles.cancelButton} onClick={closeClear} disabled={clearing}>
                  {strings.common.cancel}
                </button>
                <button type="button" className={styles.saveButton} onClick={handleClearUnaccounted} disabled={clearing}>
                  {clearing ? 'Clearing…' : 'Clear balance'}
                </button>
              </div>
            </div>
          )}
          {lastClear && !clearOpen && (
            <p className={styles.emptyText}>
              Last cleared {shortDate(lastClear.at)}: {formatAmount(lastClear.amount)} {currency}
            </p>
          )}

          {!reconcileOpen ? (
            <button type="button" className={styles.primaryButton} onClick={openReconcile}>
              {s.reconcileNowButton}
            </button>
          ) : (
            <div className={styles.reconcileCard}>
              <h2 className={styles.reconcileTitle}>{s.reconcileNowTitle}</h2>
              <p className={styles.reconcileHint}>{s.reconcileNowHint}</p>

              {/* The window the check is for: the real balances are the
                  ones at its end, compared with the ledger on that date. */}
              <WindowPicker
                label="Balances as of"
                presets={windowPresets}
                preset={preset}
                onPreset={setPreset}
                from={customFrom}
                to={customTo}
                onFrom={setCustomFrom}
                onTo={setCustomTo}
              />
              <p className={styles.reconcileHint}>
                {isNow
                  ? 'Enter what each wallet holds right now.'
                  : `Enter what each wallet held at the end of ${shortDate(span.to)}. The difference is applied to today\u2019s balance, and everything recorded after that date still counts.`}
              </p>
              {asOfError && <p className={styles.errorText}>{asOfError}</p>}
              <ScreenState loading={asOfLoading} />

              <div className={styles.accountList}>
                {accounts.map((account) => (
                  <div key={account.id} className={styles.accountRow}>
                    <div className={styles.accountInfo}>
                      <span className={styles.accountName}>{account.name}</span>
                      <span className={styles.accountLedger}>
                        {s.ledgerPrefix} {formatAmount(ledgerOf(account))} {account.currency}
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
              {/* What was already unaccounted before this check is kept: this
                  gap is added to it, never in place of it. */}
              <div className={styles.totalsRow}>
                <span>Already unaccounted for</span>
                <span>
                  {formatAmount(unaccountedBalance)} {currency}
                </span>
              </div>
              <div className={styles.totalsRow}>
                <span>Unaccounted for after this check</span>
                <span className={unaccountedBalance + liveGap === 0 ? undefined : styles.gapHighlight}>
                  {formatAmount(unaccountedBalance + liveGap)} {currency}
                </span>
              </div>

              {saveError && <p className={styles.errorText}>{saveError}</p>}

              <div className={styles.reconcileActions}>
                <button type="button" className={styles.cancelButton} onClick={closeReconcile} disabled={saving}>
                  {strings.common.cancel}
                </button>
                <button type="button" className={styles.saveButton} onClick={handleSaveReconciliation} disabled={saving || asOfLoading}>
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
