'use client';

// A wallet's audit, one screen for phone and web (like Reconciliation):
// the window, then what came in and went out from the opening balance to
// the closing one, whether the stored balance matches every entry, and
// reconciling only this wallet for the window.

import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useLogic } from '@/src/logic/walletAudit/useLogic';
import { formatAmount } from '@/src/logic/walletDetail/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { readGap } from '@/src/viewmodels/gap';
import { WindowPicker } from '@/src/widgets/WindowPicker/WindowPicker';
import styles from './WalletAuditScreen.module.css';

const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatAmount(Math.abs(n))}`;

export function WalletAuditScreen({ walletId }: { walletId: string }) {
  const v = useLogic(walletId);
  const c = v.currency;
  const st = v.statement;
  const b = v.breakdown;

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.roundButton} onClick={v.goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={`Audit ${v.name}`}
        right={
          <button type="button" className={styles.roundButton} onClick={v.rerun} aria-label="Run the audit again">
            <RefreshCw size={16} strokeWidth={2} />
          </button>
        }
      />

      <ScreenState loading={v.loading} error={v.error} />

      {!v.loading && !v.error && st && (
        <>
          <WindowPicker
            label="Window"
            presets={v.windowPresets}
            preset={v.preset}
            onPreset={v.setPreset}
            from={v.customFrom}
            to={v.customTo}
            onFrom={v.setCustomFrom}
            onTo={v.setCustomTo}
          />

          <section className={styles.card} aria-label="Money in and out">
            <h2 className={styles.cardTitle}>
              {v.span.from ? longDate(v.span.from) : 'From the start'} to {v.isNow ? 'today' : longDate(v.span.to)}
            </h2>
            <div className={styles.line} data-strong>
              <span>Opening balance</span>
              <span>
                {formatAmount(st.opening)} {c}
              </span>
            </div>
            <div className={styles.line}>
              <span>
                Money in
                <small>
                  Income {formatAmount(b.income)} ({b.incomeCount}) · Transfers in {formatAmount(b.transfersIn)} ({b.transfersInCount})
                </small>
              </span>
              <span>+{formatAmount(st.moneyIn)}</span>
            </div>
            <div className={styles.line}>
              <span>
                Money out
                <small>
                  Spending {formatAmount(b.spent)} ({b.spentCount}) · Transfers out {formatAmount(b.transfersOut)} ({b.transfersOutCount})
                  {b.charges > 0 ? ` · Charges ${formatAmount(b.charges)}` : ''}
                </small>
              </span>
              <span>−{formatAmount(st.moneyOut)}</span>
            </div>
            {st.adjusted !== 0 && (
              <div className={styles.line}>
                <span>
                  Reconciliation changes
                  <small>Set to the real balance by a check in this window</small>
                </span>
                <span>{signed(st.adjusted)}</span>
              </div>
            )}
            <div className={styles.line} data-strong data-total>
              <span>Closing balance</span>
              <span>
                {formatAmount(st.closing)} {c}
              </span>
            </div>
            <p className={styles.hint}>
              Net for the window: {signed(st.moneyIn - st.moneyOut)} {c}.{' '}
              <Link href={`/wallets/${encodeURIComponent(walletId)}`} className={styles.link}>
                See the transactions
              </Link>
            </p>
          </section>

          <section className={styles.card} aria-label="Balance check">
            <h2 className={styles.cardTitle}>Balance check</h2>
            <p className={styles.hint}>
              The {v.entryCount} entries recorded on {v.name}, with its starting balance and reconciliations, add up to {formatAmount(v.expected)} {c}. The
              wallet shows {formatAmount(v.stored)} {c}.
            </p>
            {v.difference === 0 ? (
              <p className={styles.ok}>Everything adds up.</p>
            ) : (
              <>
                <p className={styles.off}>
                  Off by {signed(v.difference)} {c}. An entry may have been saved without updating the balance.
                </p>
                {v.fixError && <p className={styles.error}>{v.fixError}</p>}
                <button type="button" className={styles.primary} onClick={v.fixBalance} disabled={v.fixing}>
                  {v.fixing ? 'Fixing…' : `Set the balance to ${formatAmount(v.expected)} ${c}`}
                </button>
              </>
            )}
          </section>

          <section className={styles.card} aria-label="Reconcile this wallet">
            <h2 className={styles.cardTitle}>Reconcile this wallet</h2>
            <p className={styles.hint}>
              {v.isNow
                ? `Enter what ${v.name} really holds now.`
                : `Enter what ${v.name} really held at the end of ${longDate(v.span.to)}. The difference is applied to today’s balance, and everything recorded after that date still counts.`}{' '}
              Money missing goes to unaccounted, and more than expected is recorded as a surplus.
            </p>
            <label className={styles.field}>
              <span>Real balance</span>
              <input type="text" inputMode="decimal" value={v.reported} onChange={(e) => v.setReported(e.target.value)} placeholder={String(st.closing)} />
            </label>
            {v.gap !== null && (
              <div className={styles.line}>
                <span>
                  {readGap(v.gap).kind === 'none' ? 'Gap' : readGap(v.gap).label}
                  <small>
                    {readGap(v.gap).kind === 'surplus' ? 'More than the ledger expected' : readGap(v.gap).kind === 'missing' ? 'Less than the ledger expected' : 'Matches the ledger'}
                  </small>
                </span>
                <span>
                  {formatAmount(readGap(v.gap).amount)} {c}
                </span>
              </div>
            )}
            {v.reconcileError && <p className={styles.error}>{v.reconcileError}</p>}
            {v.reconciledGap !== null && (
              <p className={styles.ok}>
                Saved.{' '}
                {readGap(v.reconciledGap).kind === 'none'
                  ? 'It matches the ledger.'
                  : `${formatAmount(readGap(v.reconciledGap).amount)} ${c} ${readGap(v.reconciledGap).kind === 'surplus' ? 'surplus recorded' : 'missing, added to unaccounted'}.`}
              </p>
            )}
            <button type="button" className={styles.primary} onClick={v.reconcile} disabled={v.gap === null || v.reconciling}>
              {v.reconciling ? 'Saving…' : 'Save reconciliation'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
