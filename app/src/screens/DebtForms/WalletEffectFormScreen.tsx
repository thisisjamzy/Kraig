'use client';

// Change wallet effect (src/logic/debtWalletEffect): step 1 picks cash
// debt or record only; step 2 asks what depends on the direction (past
// repayments; for a cash debt also where and when the money arrived); step
// 3 is the Impact card with every change, and "Confirm change".

import { useState } from 'react';
import { PickerCard, SubmitButton, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { useLogic } from '@/src/logic/debtWalletEffect/useLogic';
import { WALLET_EFFECT_LABEL, type DebtKind } from '@/src/shared/debt/walletEffect';
import { AccountSheet, DateSheet, DebtFormFrame, FormError, ImpactCard, dayText, fmt } from './DebtFormParts';
import { useFormExits, type DebtFormExits } from './useFormExits';
import styles from './DebtForms.module.css';

function Choice({ checked, onClick, label, hint }: { checked: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className={styles.choice} onClick={onClick}>
      {label}
      {hint && <span className={styles.choiceHint}>{hint}</span>}
    </button>
  );
}

const EFFECT_CHOICES: { value: DebtKind; label: string; hint: string }[] = [
  { value: 'cash', label: 'Counts in my balances (cash debt)', hint: 'The money came into one of my accounts.' },
  { value: 'existing', label: 'Record only', hint: 'I owe this, but the money didn’t pass through my accounts.' },
];

export function WalletEffectFormScreen({ debtId, prefillTo = null, ...exits }: { debtId: string; prefillTo?: string | null } & DebtFormExits) {
  const nav = useFormExits(debtId, exits);
  const v = useLogic(debtId, prefillTo, nav.saved);
  const [sheet, setSheet] = useState<'account' | 'date' | 'repaymentAccount' | null>(null);
  const hasStep2 = v.to === 'cash' || v.repayments.length > 0;
  const last = 3;

  return (
    <DebtFormFrame title="change wallet effect" inPanel={nav.inPanel} onClose={nav.close}>
      <ScreenState loading={v.loading} error={v.error} />
      {!v.loading && !v.error && v.debt && (
        <form
          className={cf.cards}
          onSubmit={(e) => {
            e.preventDefault();
            if (v.step === 1) v.goTo(hasStep2 ? 2 : 3);
            else if (v.step === 2) v.goTo(3);
            else void v.confirm();
          }}
        >
          <p className={styles.steps}>
            Step {v.step === 3 && !hasStep2 ? 2 : v.step} of {hasStep2 ? last : 2}
          </p>

          {v.step === 1 && (
            <div className={cf.card}>
              <span className={cf.label}>{v.debt.name} is now {WALLET_EFFECT_LABEL[v.current ?? 'existing'].toLowerCase()}. Change it to</span>
              <div className={styles.choiceList} role="radiogroup" aria-label="Wallet effect">
                {EFFECT_CHOICES.map((c) => (
                  <Choice key={c.value} checked={v.to === c.value} onClick={() => v.setTo(c.value)} label={c.label} hint={c.value === v.current ? `${c.hint} (now)` : c.hint} />
                ))}
              </div>
            </div>
          )}

          {v.step === 2 && v.to === 'cash' && (
            <div className={cf.row}>
              <PickerCard label="Received into" onClick={() => setSheet('account')} error={!v.accountId}>
                {v.accounts.find((a) => a.id === v.accountId)?.name ?? 'Choose an account'}
              </PickerCard>
              <PickerCard label="Date received" onClick={() => setSheet('date')}>
                {dayText(v.receivedOn)}
              </PickerCard>
            </div>
          )}

          {v.step === 2 && v.repayments.length > 0 && (
            <div className={cf.card}>
              <span className={cf.label}>
                Were past repayments paid from your accounts? ({v.repayments.length} {v.repayments.length === 1 ? 'repayment' : 'repayments'})
              </span>
              <div className={styles.choiceList} role="radiogroup" aria-label="Past repayments">
                {v.to === 'existing' ? (
                  <>
                    <Choice checked={v.keepRepayments} onClick={() => v.setKeepRepayments(true)} label="Yes, keep them" hint="The money really left your accounts." />
                    <Choice
                      checked={!v.keepRepayments}
                      onClick={() => v.setKeepRepayments(false)}
                      label="No, remove them from my balances"
                      hint="They stay on the debt as progress only."
                    />
                  </>
                ) : (
                  <>
                    <Choice checked={v.paidFromAccounts} onClick={() => v.setPaidFromAccounts(true)} label="Yes" hint="Each one becomes a repayment from an account." />
                    <Choice checked={!v.paidFromAccounts} onClick={() => v.setPaidFromAccounts(false)} label="No" hint="They stay on the debt as progress only." />
                  </>
                )}
              </div>
            </div>
          )}

          {v.step === 2 && v.to === 'cash' && v.paidFromAccounts && v.repayments.length > 0 && (
            <>
              <PickerCard label="Paid from" onClick={() => setSheet('repaymentAccount')}>
                {v.accounts.find((a) => a.id === v.repaymentAccountId)?.name ?? 'Choose an account'}
              </PickerCard>
              {v.repayments.length > 1 && (
                <div className={cf.card}>
                  <span className={cf.label}>Or per repayment</span>
                  <ul className={styles.perRepayment}>
                    {v.repayments.map((r) => (
                      <li key={r.id}>
                        <span>
                          {fmt(r.amount)} on {r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                        <select
                          aria-label={`Account for the repayment of ${fmt(r.amount)}`}
                          value={v.perRepayment[r.id] ?? ''}
                          onChange={(e) => {
                            const next = { ...v.perRepayment };
                            if (e.target.value) next[r.id] = e.target.value;
                            else delete next[r.id];
                            v.setPerRepayment(next);
                          }}
                        >
                          <option value="">Same as above</option>
                          {v.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {v.step === 3 && (
            <ImpactCard lines={v.preview?.plan?.lines ?? []} warnings={v.preview?.plan?.warnings ?? []} error={v.preview?.error ?? null} />
          )}

          <SubmitButton disabled={v.saving || (v.step === 1 && v.sameType) || (v.step === 3 && (!v.preview?.plan || v.preview.plan.noop))}>
            {v.step === 3 ? (v.saving ? 'Saving…' : 'Confirm change') : 'Next'}
          </SubmitButton>
          {v.step > 1 && (
            <button type="button" className={styles.secondary} onClick={() => v.goTo(v.step === 3 && hasStep2 ? 2 : 1)}>
              Back to the previous step
            </button>
          )}
          <FormError message={v.saveError} />
        </form>
      )}
      {sheet === 'account' && <AccountSheet title="Received into" accounts={v.accounts} value={v.accountId} onChange={v.setAccountId} onClose={() => setSheet(null)} />}
      {sheet === 'repaymentAccount' && (
        <AccountSheet title="Paid from" accounts={v.accounts} value={v.repaymentAccountId} onChange={v.setRepaymentAccountId} onClose={() => setSheet(null)} />
      )}
      {sheet === 'date' && <DateSheet title="Date received" value={v.receivedOn} onChange={v.setReceivedOn} onClose={() => setSheet(null)} />}
    </DebtFormFrame>
  );
}
