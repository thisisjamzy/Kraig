'use client';

// Change wallet effect (src/screens/DebtForms/WalletEffectFormScreen):
// switching a debt between a cash debt (counts in my balances) and record
// only, in three steps.
//   1. Which one.
//   2. To record only: were past repayments paid from your accounts (keep
//      them, the default, or take them out of the balances). To cash debt:
//      the account it was received into and the date, then whether past
//      repayments were paid from an account (and which).
//   3. The Impact: every account and its new balance, every month and its
//      income change, every transaction excluded or created, from the
//      planner itself (src/shared/debt/walletEffect.ts).
// "Confirm change" runs it in one transaction and offers Undo for 10s.
// The step lives in the URL (?step=) and moves with replace, so the form
// never stays in history.

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { changeDebtWalletEffect, undoDebtChange } from '@/src/shared/firestore/debtWrites';
import { planWalletChange, WalletChangeError, WALLET_EFFECT_LABEL, type DebtKind, type WalletChange } from '@/src/shared/debt/walletEffect';
import { useDebtLedger } from '@/src/shared/hooks/useDebtLedger';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export type Step = 1 | 2 | 3;

export function useLogic(debtId: string, prefillTo: string | null, onSaved: (debtId: string) => void) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ledger = useDebtLedger(debtId);
  const { uid, debt, accounts, ctx, walletState } = ledger;

  const stepParam = Number(params.get('step'));
  const step: Step = stepParam === 2 || stepParam === 3 ? stepParam : 1;
  function goTo(next: Step) {
    const sp = new URLSearchParams(params.toString());
    if (next === 1) sp.delete('step');
    else sp.set('step', String(next));
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const current: DebtKind | null = debt?.debtType ?? null;
  const [toChoice, setTo] = useState<DebtKind | null>(prefillTo === 'cash' || prefillTo === 'existing' ? prefillTo : null);
  const to: DebtKind = toChoice ?? (current === 'cash' ? 'existing' : 'cash');

  // To record only: keep the repayments in the balances (the default).
  const [keepRepayments, setKeepRepayments] = useState(true);
  // To cash: where and when it arrived. Defaults: the excluded borrowing
  // transaction's account and date when there is one, else the debt's start.
  const borrowing = walletState?.borrowing ?? null;
  const [accountChoice, setAccountChoice] = useState('');
  const [receivedChoice, setReceivedChoice] = useState<string | null>(null);
  const receivedOn = receivedChoice ?? (borrowing ? isoDay(borrowing.date) : debt ? isoDay(debt.startDate.toDate()) : isoDay(new Date()));
  const accountId = accountChoice || borrowing?.accountId || debt?.accountId || accounts[0]?.id || '';
  // Past repayments paid from an account? Defaults to yes when some already were.
  const repayments = walletState?.repayments ?? [];
  const [paidFromAccountsChoice, setPaidFromAccounts] = useState<boolean | null>(null);
  const paidFromAccounts = paidFromAccountsChoice ?? (walletState?.repaymentTxs.length ?? 0) > 0;
  const [repaymentAccountChoice, setRepaymentAccountId] = useState('');
  const repaymentAccountId = repaymentAccountChoice || accountId;
  const [perRepayment, setPerRepayment] = useState<Record<string, string>>({});

  const change: WalletChange =
    to === 'existing'
      ? { kind: 'toRecordOnly', repayments: keepRepayments ? 'keep' : 'remove' }
      : {
          kind: 'toCash',
          accountId,
          receivedOn: fromIso(receivedOn),
          repayments: paidFromAccounts ? { fromAccounts: true, accountId: repaymentAccountId, perRepayment } : { fromAccounts: false },
        };

  const now = useMemo(() => new Date(), []);
  const preview = useMemo(() => {
    if (!walletState) return null;
    try {
      return { plan: planWalletChange(walletState, change, ctx, now, () => 'preview', formatMoney), error: null };
    } catch (caught) {
      return { plan: null, error: caught instanceof WalletChangeError ? caught.message : 'Could not work out this change.' };
    }
    // `change` is rebuilt every render from the values below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletState, ctx, now, to, keepRepayments, accountId, receivedOn, paidFromAccounts, repaymentAccountId, perRepayment]);

  const sameType = to === current;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function confirm() {
    if (!uid || !debt || saving || !preview?.plan || preview.plan.noop) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await changeDebtWalletEffect(uid, debtId, change, ctx, formatMoney);
      if (result.applied) {
        const id = result.changeId;
        showToast(`${debt.name} is now ${WALLET_EFFECT_LABEL[to].toLowerCase()}`, {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () =>
              void undoDebtChange(uid, debtId, id)
                .then(() => showToast('Change undone'))
                .catch((e) => showToast(e instanceof Error ? e.message : 'Could not undo that.')),
          },
        });
      }
      onSaved(debtId);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not change this debt.');
      setSaving(false);
    }
  }

  return {
    debt,
    current,
    to,
    setTo,
    sameType,
    step,
    goTo,
    keepRepayments,
    setKeepRepayments,
    accounts,
    accountId,
    setAccountId: setAccountChoice,
    receivedOn,
    setReceivedOn: setReceivedChoice,
    repayments,
    paidFromAccounts,
    setPaidFromAccounts,
    repaymentAccountId,
    setRepaymentAccountId,
    perRepayment,
    setPerRepayment,
    preview,
    saving,
    saveError,
    confirm,
    loading: ledger.loading,
    error: ledger.error,
  };
}
