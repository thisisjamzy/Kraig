// Opening a debt form — New debt, Edit debt, Record repayment, Edit payment
// plan, Change wallet effect — the same way tasks open (taskPanel.ts): on
// medium screens and up a 560px side peek over the current page, with the
// URL saying so (/debts/abc?debtForm=repay&debt=abc); on a phone, the
// form's own page. PanelHost renders the peek from the URL, and sends a
// phone that opens such a link to the full page instead.
//
// Saving or cancelling replaces the history entry (PanelHost's close, or
// router.replace from a full page), so Back never returns into a form.
// The addresses live here (pure, tested in test/debtPages.test.ts); the
// opener is useDebtForms.ts.

export type DebtFormKind = 'new' | 'edit' | 'repay' | 'plan' | 'wallet';

export const DEBT_FORM_PARAM = 'debtForm';
export const DEBT_ID_PARAM = 'debt';
/** Carried in the URL: a repayment amount, the wallet effect to switch to, the wallet form's step. */
export const DEBT_PREFILL_PARAMS = ['amount', 'to', 'step'];

const KINDS: DebtFormKind[] = ['new', 'edit', 'repay', 'plan', 'wallet'];

export function isDebtFormKind(value: string | null): value is DebtFormKind {
  return KINDS.includes(value as DebtFormKind);
}

/** The full-page address: what a phone always uses. */
export function debtFormPageHref(kind: DebtFormKind, debtId?: string | null, params?: Record<string, string>) {
  const sp = new URLSearchParams(params);
  const q = sp.toString() ? `?${sp.toString()}` : '';
  if (kind === 'new' || !debtId) return `/debts/new${q}`;
  return `/debts/${encodeURIComponent(debtId)}/${kind}${q}`;
}

/** The current URL without the debt form. */
export function withoutDebtForm(pathname: string, search: string): string {
  const sp = new URLSearchParams(search);
  sp.delete(DEBT_FORM_PARAM);
  sp.delete(DEBT_ID_PARAM);
  for (const p of DEBT_PREFILL_PARAMS) sp.delete(p);
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}
