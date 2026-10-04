'use client';

// The notices at the top of the Budget page, phone and wide alike:
//   - the one-time migration review ("Your budget was reorganised");
//   - the start-of-month banner ("October is set up from your recurring
//     items. 14 lines added: ...") with Review and Dismiss;
//   - "Did AIMS salary (1,013,381) arrive?" for each expected income line
//     whose date has passed: Yes, record it / Different amount / Not yet.

import { useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, CircleHelp, Sparkles } from 'lucide-react';
import type { LineRow } from '@/src/logic/budgetMonth/lines';
import styles from '@/src/phone/screens/Planning/Banners.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function MigrationNotice() {
  return (
    <div className={styles.banner} data-tone="blue" role="status">
      <Sparkles size={18} strokeWidth={2.25} aria-hidden />
      <p>Your budget now keeps income, expenses, savings and transfers apart. See what changed.</p>
      <Link href="/budget/migration" className={styles.bannerButton}>
        Review changes
      </Link>
    </div>
  );
}

export function SetupBanner({ text, month, onDismiss }: { text: string; month: string; onDismiss: () => void }) {
  return (
    <div className={styles.banner} role="status">
      <CalendarCheck size={18} strokeWidth={2.25} aria-hidden />
      <p>{text}</p>
      <span className={styles.bannerActions}>
        <Link href={`/budget/review?month=${month}`} className={styles.bannerButton}>
          Review
        </Link>
        <button type="button" className={styles.bannerGhost} onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  );
}

export function IncomePrompt({
  line,
  currency,
  accounts,
  onRecord,
  onNotYet,
}: {
  line: LineRow;
  currency: string;
  accounts: { id: string; name: string }[];
  onRecord: (amount: number, accountId: string | null) => Promise<void>;
  onNotYet: () => Promise<void>;
}) {
  const [different, setDifferent] = useState(false);
  const [amount, setAmount] = useState(money(line.planned));
  const [accountId, setAccountId] = useState(line.accountId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
      setBusy(false);
    }
  }
  const parsed = Number(amount.replace(/[\s,]/g, ''));

  return (
    <div className={styles.banner} data-tone="question" role="group" aria-label={`Did ${line.name} arrive?`}>
      <CircleHelp size={18} strokeWidth={2.25} aria-hidden />
      <div className={styles.promptBody}>
        <p>
          Did <strong>{line.name}</strong> ({money(line.planned)} {currency}) arrive?
        </p>
        {(different || !line.accountId) && (
          <div className={styles.promptFields}>
            {different && (
              <label>
                <span>Amount received</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </label>
            )}
            {!line.accountId && (
              <label>
                <span>Into</span>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Choose account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {error && (
          <p className={styles.promptError} role="alert">
            {error}
          </p>
        )}
      </div>
      <span className={styles.bannerActions}>
        {different ? (
          <button
            type="button"
            className={styles.bannerButton}
            disabled={busy || !(parsed > 0)}
            onClick={() => run(() => onRecord(parsed, accountId || null))}
          >
            Record {Number.isFinite(parsed) ? money(parsed) : ''}
          </button>
        ) : (
          <>
            <button type="button" className={styles.bannerButton} disabled={busy} onClick={() => run(() => onRecord(line.planned, accountId || null))}>
              Yes, record it
            </button>
            <button type="button" className={styles.bannerGhost} disabled={busy} onClick={() => setDifferent(true)}>
              Different amount
            </button>
          </>
        )}
        <button type="button" className={styles.bannerGhost} disabled={busy} onClick={() => run(onNotYet)}>
          Not yet
        </button>
      </span>
    </div>
  );
}
