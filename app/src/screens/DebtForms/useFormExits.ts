'use client';

// Where a debt form goes when it's done. In the side peek, PanelHost hands
// in its own close (the page without the form) and save (the debt's page,
// or close). On a full page, both replace the form's history entry: Back
// never returns into a form.

import { useRouter } from 'next/navigation';
import { debtFormPageHref, type DebtFormKind } from '@/src/shared/navigation/debtForms';

export interface DebtFormExits {
  /** In the 560px side peek (medium screens and up). */
  inPanel?: boolean;
  onClose?: () => void;
  onSaved?: (debtId: string) => void;
  /** Move to another debt form in place (Edit debt's Type to Change wallet effect). */
  onSwitch?: (kind: DebtFormKind, debtId: string, params?: Record<string, string>) => void;
}

export function useFormExits(debtId: string | null, exits: DebtFormExits) {
  const router = useRouter();
  const home = debtId ? `/debts/${encodeURIComponent(debtId)}` : '/debts';
  return {
    inPanel: Boolean(exits.inPanel),
    close: exits.onClose ?? (() => router.replace(home)),
    saved: exits.onSaved ?? ((id: string) => router.replace(`/debts/${encodeURIComponent(id)}`)),
    switchTo: exits.onSwitch ?? ((kind: DebtFormKind, id: string, params?: Record<string, string>) => router.replace(debtFormPageHref(kind, id, params))),
  };
}
