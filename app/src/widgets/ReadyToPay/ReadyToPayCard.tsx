'use client';

// "AIMS salary received: 1,013,381 XAF. 4 payments are ready." — the
// payments the app prepared when their trigger fired, in priority order,
// each with a checkbox (all checked), an editable amount and the account
// it's paid from; what the money received doesn't cover yet waits under
// "Not enough yet". "Confirm selected" records them (Undo for 10 seconds);
// "Later" hides the card until the app is opened again. Shown at the top
// of Home and the Budget page, and as the Ready to pay page.

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock } from 'lucide-react';
import { useReadyToPay, type ReadyEntry } from '@/src/shared/hooks/useReadyToPay';
import styles from './ReadyToPayCard.module.css';

const LATER_KEY = 'dreda.readyToPay.later';

function readLater(): number {
  try {
    return Number(sessionStorage.getItem(LATER_KEY) ?? 0);
  } catch {
    return 0;
  }
}

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const FLOW_LABEL = { Expense: 'Expense', Savings: 'Savings', Transfer: 'Transfer' } as const;

export function ReadyToPayCard({ page = false }: { page?: boolean }) {
  const q = useReadyToPay();
  // "Later": hidden until the queue changes or the app is opened again.
  const [later, setLater] = useState(readLater);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Record<string, string>>({});

  if (q.loading) return null;
  if (!q.count && !(page && q.waiting.length)) {
    return page ? (
      <section className={styles.card} aria-label="Ready to pay">
        <p className={styles.empty}>
          <CheckCircle2 size={18} strokeWidth={2} aria-hidden /> Nothing is waiting. Payments set to be prepared appear here when their income arrives or
          their date comes.
        </p>
      </section>
    ) : null;
  }
  if (!page && later === q.count) return null;

  const amountOf = (e: ReadyEntry) => {
    const raw = amounts[e.id];
    const n = raw === undefined ? e.amount : Number(raw.replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const accountOf = (e: ReadyEntry) => accounts[e.id] ?? e.accountId ?? '';
  const chosen = q.proposed.filter((e) => !unchecked.has(e.id));
  const total = chosen.reduce((s, e) => s + amountOf(e) + (e.fee ?? 0), 0);

  async function confirm() {
    const ok = await q.confirm(chosen.map((entry) => ({ entry, amount: amountOf(entry), accountId: accountOf(entry) || null })));
    if (ok) {
      setUnchecked(new Set());
      setAmounts({});
    }
  }

  return (
    <section className={styles.card} aria-label="Ready to pay">
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden>
          <Clock size={18} strokeWidth={2.25} />
        </span>
        <div>
          <h2 className={styles.title}>{q.headline}</h2>
          <p className={styles.sub}>
            {q.proposed.length ? `${money(q.available)} ${q.currency} received and not yet used covers ${q.proposed.length} of them.` : `Nothing is covered yet: ${money(Math.max(0, q.available))} ${q.currency} available.`}
          </p>
        </div>
      </header>

      {q.proposed.length > 0 && (
        <ul className={styles.list}>
          {q.proposed.map((e) => (
            <li key={e.id} className={styles.row}>
              <input
                type="checkbox"
                className={styles.check}
                checked={!unchecked.has(e.id)}
                aria-label={`Pay ${e.name}`}
                onChange={() =>
                  setUnchecked((s) => {
                    const next = new Set(s);
                    if (next.has(e.id)) next.delete(e.id);
                    else next.add(e.id);
                    return next;
                  })
                }
              />
              <span className={styles.what}>
                <strong>{e.name}</strong>
                {e.updated && (
                  <span className={styles.updated} title={`Was ${money(e.updated.from)}, now ${money(e.updated.to)}`}>
                    Updated
                  </span>
                )}
                <span>
                  {FLOW_LABEL[e.flow]} · {e.bucketName}
                  {e.fee ? ` · fee ${money(e.fee)}` : ''}
                </span>
              </span>
              <label className={styles.amount}>
                <span className={styles.srOnly}>Amount for {e.name}</span>
                <input
                  inputMode="decimal"
                  value={amounts[e.id] ?? money(e.amount)}
                  onChange={(ev) => setAmounts((a) => ({ ...a, [e.id]: ev.target.value }))}
                  onBlur={() => {
                    if (amounts[e.id] !== undefined) void q.editAmount(e, amountOf(e) > 0 ? amountOf(e) : null);
                  }}
                />
                <span className={styles.unit}>{q.currency}</span>
              </label>
              <label className={styles.account}>
                <span className={styles.srOnly}>Account for {e.name}</span>
                <select value={accountOf(e)} onChange={(ev) => setAccounts((a) => ({ ...a, [e.id]: ev.target.value }))}>
                  <option value="">Choose account</option>
                  {q.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}

      {q.notEnough.length > 0 && (
        <div className={styles.waiting}>
          <h3>Not enough yet</h3>
          <ul>
            {q.notEnough.map((e) => (
              <li key={e.id}>
                <span>{e.name}</span>
                <span>
                  {money(e.amount)} {q.currency}
                </span>
              </li>
            ))}
          </ul>
          <p>These stay here for the next income.</p>
        </div>
      )}

      {page && q.waiting.length > 0 && (
        <div className={styles.waiting}>
          <h3>Waiting for income</h3>
          <ul>
            {q.waiting.map((e) => (
              <li key={e.id}>
                <span>
                  {e.name} · waiting for {e.waitingFor}
                </span>
                <span>
                  {money(e.amount)} {q.currency}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q.error && (
        <p className={styles.error} role="alert">
          {q.error}
        </p>
      )}

      <div className={styles.actions}>
        {!page && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              try {
                sessionStorage.setItem(LATER_KEY, String(q.count));
              } catch {
                // Hidden for this view only.
              }
              setLater(q.count);
            }}
          >
            Later
          </button>
        )}
        {!page && (
          <Link href="/budget/ready" className={styles.link}>
            Open Ready to pay
          </Link>
        )}
        <button type="button" className={styles.primary} disabled={q.busy || !chosen.length} onClick={confirm}>
          {q.busy ? 'Recording…' : `Confirm selected${chosen.length ? ` (${money(total)} ${q.currency})` : ''}`}
        </button>
      </div>
    </section>
  );
}
