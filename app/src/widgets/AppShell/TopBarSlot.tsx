'use client';

// The header row on medium screens and up (Dreda.figcraft `Top bar`): the
// page's title and subtitle on the left, then Search, the page's own
// controls, notifications and the main action. Pages feed it two ways:
//   - <TopBarControls>: a date navigator, a view toggle, beside Search;
//   - <TopBarTitle>: the page's title block, moved into the header;
//   - <TopBarActions>: the page's own buttons (New folder, New project),
//     on the same row just before the module's main action (New task);
//   - <TopBarPrimary>: replaces the main action itself (Work's New menu).
// On a phone there is no header: controls render nothing and the title
// renders where the page put it.

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const TopBarSlotContext = createContext<HTMLElement | null>(null);
export const TopBarTitleContext = createContext<HTMLElement | null>(null);
export const TopBarActionsContext = createContext<HTMLElement | null>(null);
export const TopBarPrimaryContext = createContext<HTMLElement | null>(null);

export function TopBarControls({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/** The page's own buttons, beside the main action. Nothing on a phone. */
export function TopBarActions({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarActionsContext);
  return slot ? createPortal(children, slot) : null;
}

/** Replaces the module's main action (New task) with the page's own. Nothing on a phone. */
export function TopBarPrimary({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarPrimaryContext);
  return slot ? createPortal(children, slot) : null;
}

/** The page's title block: in the header when there is one, else in place. */
export function TopBarTitle({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarTitleContext);
  return slot ? createPortal(children, slot) : <>{children}</>;
}

/** Is there a top bar to put controls in (medium screens and up)? */
export function useHasTopBar(): boolean {
  return useContext(TopBarSlotContext) !== null;
}
