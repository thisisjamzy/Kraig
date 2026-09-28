'use client';

// Page-level controls in the top bar (a date navigator, a view toggle):
// a page renders <TopBarControls>…</TopBarControls> and, on medium screens
// and up, they appear in the top bar beside the title. On a phone there is
// no top bar and nothing renders — the page keeps its own header.

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const TopBarSlotContext = createContext<HTMLElement | null>(null);

export function TopBarControls({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/** Is there a top bar to put controls in (medium screens and up)? */
export function useHasTopBar(): boolean {
  return useContext(TopBarSlotContext) !== null;
}
