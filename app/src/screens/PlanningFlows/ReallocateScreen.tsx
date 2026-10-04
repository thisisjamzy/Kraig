'use client';

// Reallocate a leftover — a full page: where it goes (another bucket,
// savings, or next month's same bucket), how much (with 25% / 50% / all),
// and a summary of the move before confirming.

import { ArrowLeft, CalendarPlus, Layers, PiggyBank } from 'lucide-react';
import { useLogic, type Destination } from '@/src/logic/planningReallocate/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { money, monthTitle } from '@/src/viewmodels/planning';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import f from './Flows.module.css';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useOwnsTitle } from '@/src/widgets/AppShell/breadcrumb';

const DESTINATIONS: { id: Destination; label: string; icon: typeof Layers }[] = [
  { id: 'bucket', label: 'Another basket', icon: Layers },
  { id: 'savings', label: 'Savings', icon: PiggyBank },
  { id: 'next', label: 'Next month', icon: CalendarPlus },
];

const QUICK = [0.25, 0.5, 1] as const;

export function ReallocateScreen() {
  // Draws its own title: the shell adds none on wide screens.
  useOwnsTitle(useHasTopBar());
  const r = useLogic();

  return (
    <div className={`${p.page} ${p.detail} ${f.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={r.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
      />

      <ScreenState loading={r.loading} error={!r.loading && r.total <= 0 ? 'There’s nothing left over here to move.' : null} />

      {!r.loading && r.total > 0 && (
        <>
          <h1 className={f.headline} data-tone="leftover">
            {money(r.total)} {r.currency} left over
          </h1>
          <p className={f.on}>
            on <strong>{r.fromName}</strong>
          </p>

          <p className={f.label}>Where it goes</p>
          <div className={f.destinations} role="radiogroup" aria-label="Where it goes">
            {DESTINATIONS.map((d) => {
              const Icon = d.icon;
              const disabled = (d.id === 'next' && r.nextTotal <= 0) || (d.id === 'savings' && r.savingsAccounts.length === 0);
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  className={f.destination}
                  aria-checked={r.destination === d.id}
                  disabled={disabled}
                  onClick={() => r.setDestination(d.id)}
                >
                  <Icon size={20} strokeWidth={2} aria-hidden />
                  {d.id === 'next' ? `${monthTitle(r.nextMonth).split(' ')[0]}` : d.label}
                </button>
              );
            })}
          </div>

          {r.destination === 'bucket' && (
            <>
              <p className={f.label}>Into</p>
              <div className={f.pickList} role="radiogroup" aria-label="Into">
                {r.targets.slice(0, 12).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    className={f.pick}
                    aria-checked={r.target?.key === t.key}
                    onClick={() => r.setTargetKey(t.key)}
                  >
                    <span>
                      {t.name}
                      <br />
                      <small>{t.bucketName}</small>
                    </span>
                    <small data-tone={t.needs > 0 ? 'over' : undefined}>
                      {t.needs > 0 ? `Over by ${money(t.needs)}` : `${money(Math.max(0, t.remaining))} left`}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}

          {r.destination === 'savings' && (
            <div className={f.sources}>
              <label className={f.field}>
                Savings account
                <select value={r.savingsAccount?.id ?? ''} onChange={(e) => r.setSavingsId(e.target.value)}>
                  {r.savingsAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={f.field}>
                Moved out of
                <select value={r.wallet?.id ?? ''} onChange={(e) => r.setWalletId(e.target.value)}>
                  {r.wallets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {r.destination === 'next' && (
            <p className={f.hint}>
              {money(r.nextTotal)} {r.currency} can roll into {monthTitle(r.nextMonth)}, items that repeat next month.
            </p>
          )}

          <p className={f.label}>Amount</p>
          <label className={f.amountBox}>
            <input
              inputMode="decimal"
              value={r.amountString}
              onChange={(e) => r.setAmountString(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              aria-label="Amount"
            />
            <span>{r.currency}</span>
          </label>
          <div className={f.quick}>
            {QUICK.map((pct) => {
              const value = Math.round(r.limit * pct * 100) / 100;
              return (
                <button key={pct} type="button" aria-pressed={Number(r.amountString) === value} onClick={() => r.quick(pct)}>
                  {pct === 1 ? 'All' : `${pct * 100}%`}
                </button>
              );
            })}
          </div>

          <p className={f.label}>Note (optional)</p>
          <textarea
            className={f.note}
            rows={2}
            value={r.note}
            onChange={(e) => r.setNote(e.target.value)}
            placeholder="Why you're moving it"
            aria-label="Note"
          />

          {r.summary && <p className={f.summary}>{r.summary}</p>}
          {(r.error || (r.problem && r.amountString)) && <p className={f.problem}>{r.error ?? r.problem}</p>}

          <div className={p.sticky}>
            <button type="button" className={`${p.fillButton} ${p.bigButton} ${f.confirm}`} disabled={!r.canConfirm} onClick={r.confirm}>
              {r.busy ? 'Moving…' : 'Confirm move'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
