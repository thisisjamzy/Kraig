'use client';

// Ready to pay on a phone: a full-screen page in the BASELINE list style.
// What the money received covers, grouped by type (Expenses, Savings,
// Transfers), each payment checked by default with its amount and the
// account it's paid from; what isn't covered yet waits under "Not enough
// yet". One button at the bottom confirms the selected payments (Undo for
// 10 seconds, from the shared queue logic).

import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useReadyToPay, type ReadyEntry } from '@/src/shared/hooks/useReadyToPay';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { CollapsibleGroup } from '@/src/phone/widgets/CollapsibleGroup/CollapsibleGroup';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/ReadyToPay/ReadyToPayScreen.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const GROUPS = [
  { flow: 'Expense', title: 'Expenses' },
  { flow: 'Savings', title: 'Savings' },
  { flow: 'Transfer', title: 'Transfers' },
] as const;

export function ReadyToPayScreen() {
  const q = useReadyToPay();
  const goBack = useGoBack();
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Record<string, string>>({});

  const amountOf = (e: ReadyEntry) => {
    const raw = amounts[e.id];
    const n = raw === undefined ? e.amount : Number(raw.replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const accountOf = (e: ReadyEntry) => accounts[e.id] ?? e.accountId ?? '';
  const chosen = q.proposed.filter((e) => !unchecked.has(e.id));
  const total = chosen.reduce((s, e) => s + amountOf(e) + (e.fee ?? 0), 0);
  const toggle = (id: string) =>
    setUnchecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function confirm() {
    const ok = await q.confirm(chosen.map((entry) => ({ entry, amount: amountOf(entry), accountId: accountOf(entry) || null })));
    if (ok) {
      setUnchecked(new Set());
      setAmounts({});
    }
  }

  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={() => goBack('/budget')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Ready to pay"
      />

      <ScreenState loading={q.loading} />

      {!q.loading && q.count === 0 && (
        <p className={p.empty}>Nothing is waiting. Payments set to be prepared appear here when their income arrives or their date comes.</p>
      )}

      {!q.loading && q.count > 0 && (
        <>
          <section className={p.card}>
            <p className={styles.headline}>{q.headline}</p>
            <p className={styles.sub}>
              {q.proposed.length
                ? `${money(q.available)} ${q.currency} received and not yet used covers ${q.proposed.length} of them.`
                : `Nothing is covered yet: ${money(Math.max(0, q.available))} ${q.currency} available.`}
            </p>
          </section>

          {GROUPS.map(({ flow, title }) => {
            const rows = q.proposed.filter((e) => e.flow === flow);
            if (!rows.length) return null;
            return (
              <CollapsibleGroup key={flow} title={title} count={rows.length} total={`${money(rows.reduce((s, e) => s + e.amount, 0))} ${q.currency}`}>
                {rows.map((e) => {
                  const on = !unchecked.has(e.id);
                  return (
                    <div key={e.id} className={p.row}>
                      <button
                        type="button"
                        className={styles.check}
                        data-on={on || undefined}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Pay ${e.name}`}
                        onClick={() => toggle(e.id)}
                      >
                        {on && <Check size={14} strokeWidth={3} />}
                      </button>
                      <span className={p.rowMain}>
                        <span className={p.rowName}>{e.name}</span>
                        <span className={p.rowNote}>
                          {e.bucketName}
                          {e.fee ? ` · fee ${money(e.fee)}` : ''}
                        </span>
                        <select
                          className={styles.account}
                          value={accountOf(e)}
                          aria-label={`Account for ${e.name}`}
                          onChange={(ev) => setAccounts((a) => ({ ...a, [e.id]: ev.target.value }))}
                        >
                          <option value="">Choose account</option>
                          {q.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </span>
                      <label className={p.rowSide}>
                        <span className={p.srOnly}>Amount for {e.name}</span>
                        <input
                          className={styles.amount}
                          inputMode="decimal"
                          value={amounts[e.id] ?? money(e.amount)}
                          onChange={(ev) => setAmounts((a) => ({ ...a, [e.id]: ev.target.value }))}
                        />
                        <span className={p.rowWhen}>{q.currency}</span>
                      </label>
                    </div>
                  );
                })}
              </CollapsibleGroup>
            );
          })}

          {q.notEnough.length > 0 && (
            <CollapsibleGroup title="Not enough yet" count={q.notEnough.length} defaultOpen={false}>
              {q.notEnough.map((e) => (
                <div key={e.id} className={p.row}>
                  <span className={p.rowMain}>
                    <span className={p.rowName}>{e.name}</span>
                    <span className={p.rowNote}>Waits for the next income</span>
                  </span>
                  <span className={p.rowSide}>
                    <span className={p.rowAmount}>
                      {money(e.amount)} {q.currency}
                    </span>
                  </span>
                </div>
              ))}
            </CollapsibleGroup>
          )}

          {q.error && (
            <p className={styles.error} role="alert">
              {q.error}
            </p>
          )}

          {q.proposed.length > 0 && (
            <div className={p.sticky}>
              <span className={p.stickyAmount}>
                <span className={p.stickyLabel}>{chosen.length} selected</span>
                <span className={p.stickyValue}>
                  {money(total)}
                  <small>{q.currency}</small>
                </span>
              </span>
              <button type="button" className={`${p.fillButton} ${p.bigButton}`} disabled={q.busy || !chosen.length} onClick={confirm}>
                {q.busy ? 'Recording…' : 'Confirm'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
