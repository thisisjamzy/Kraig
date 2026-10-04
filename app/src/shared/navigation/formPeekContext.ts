'use client';

import { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';

// Whether a form is showing in a side peek (formPeek.ts, PanelHost), and
// how to close it. Forms and their logic read it to finish the right way.

export interface FormPeekState {
  /** The form is in a side peek (wide screens only). */
  peek: boolean;
  /** Closes the peek (replaces the history entry). */
  close: () => void;
  /** The form's own page, for "Open as full page". */
  fullPageHref: string | null;
}

export const FormPeekContext = createContext<FormPeekState | null>(null);

/** Inside a side peek: how to close it. Null on a full page. */
export function useFormPeek(): FormPeekState | null {
  return useContext(FormPeekContext);
}

/**
 * How a form finishes (saved or cancelled): in a side peek it closes the
 * peek; on its own page it goes to `to`, replacing the form's history entry
 * so Back never returns into it.
 */
export function useFormFinish() {
  const router = useRouter();
  const peek = useFormPeek();
  return (to: string) => (peek ? peek.close() : router.replace(to));
}
