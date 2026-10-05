// Dismissed action cards ("Review October budget · 14 lines", "9 payments
// ready to confirm", a basket's cover-or-justify prompt). A dismissal is
// stored per card and per state in the preferences doc (synced across
// devices): the card's state key ("review:2026-10") and, for a card about a
// set of items, the items it showed. The card stays hidden while its state
// is the same: same key, and no item it didn't show before. It comes back
// when its content changes (a new month to review, a new payment ready),
// never just because time passed. Dismissing hides the card only: its
// items stay in Notifications, Ready to pay and the Budget screens.
// Pure; tested in test/dismissals.test.ts.

export interface CardState {
  /** What the card is about now ("review:2026-10", "readyToPay"). */
  key: string;
  /** The items it shows, when it's about a set of them. */
  ids?: string[];
}

export type DismissedCards = Record<string, CardState>;

export function isCardHidden(dismissed: DismissedCards | undefined, cardId: string, now: CardState): boolean {
  const was = dismissed?.[cardId];
  if (!was || was.key !== now.key) return false;
  if (!now.ids) return true;
  const seen = new Set(was.ids ?? []);
  return now.ids.every((id) => seen.has(id));
}

/** What to store on dismissing (ids sorted, so equal sets compare equal). */
export function dismissalOf(now: CardState): CardState {
  return now.ids ? { key: now.key, ids: [...now.ids].sort() } : { key: now.key };
}
