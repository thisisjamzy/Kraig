// The Notifications page's views, order and day groups, the badge count,
// and when the app-open prompt shows. Pure, tested in
// test/notifications.test.ts.

import { SEVERITY_RANK, type StoredNotification } from './types';

export type InboxView = 'inbox' | 'unread' | 'snoozed' | 'resolved' | 'archived';

export const VIEW_LABEL: Record<InboxView, string> = { inbox: 'Inbox', unread: 'Unread', snoozed: 'Snoozed', resolved: 'Resolved', archived: 'Archived' };

const snoozed = (n: StoredNotification, now: Date) => n.snoozedUntil !== null && n.snoozedUntil > now;

export function inView(n: StoredNotification, view: InboxView, now: Date): boolean {
  const open = !n.resolvedAt && !n.archivedAt;
  switch (view) {
    case 'inbox':
      return open && !snoozed(n, now);
    case 'unread':
      return open && !snoozed(n, now) && !n.readAt;
    case 'snoozed':
      return open && snoozed(n, now);
    case 'resolved':
      return n.resolvedAt !== null;
    case 'archived':
      return !n.resolvedAt && n.archivedAt !== null;
  }
}

/** Unread before read, then urgent, warning, info, positive, then newest. */
export function comparePriority(a: StoredNotification, b: StoredNotification): number {
  const ua = a.readAt ? 1 : 0;
  const ub = b.readAt ? 1 : 0;
  if (ua !== ub) return ua - ub;
  const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (s !== 0) return s;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export function compareNewest(a: StoredNotification, b: StoredNotification): number {
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export type DayGroup = 'Today' | 'Yesterday' | 'This week' | 'Earlier';
export const DAY_GROUPS: DayGroup[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

export function dayGroup(at: Date, now: Date): DayGroup {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = at.getTime();
  if (t >= start) return 'Today';
  if (t >= start - 86_400_000) return 'Yesterday';
  if (t >= start - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

/** "Just now", "12 min ago", "3h ago", "Yesterday", "Tue", "3 Oct". */
export function relativeTime(at: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const group = dayGroup(at, now);
  if (group === 'Today') return `${Math.floor(minutes / 60)}h ago`;
  if (group === 'Yesterday') return 'Yesterday';
  if (group === 'This week') return at.toLocaleDateString('en-GB', { weekday: 'short' });
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The badge: unread in the inbox (not snoozed, resolved or archived). */
export function unreadCount(all: StoredNotification[], now: Date): { unread: number; urgent: number } {
  const unread = all.filter((n) => inView(n, 'unread', now));
  return { unread: unread.length, urgent: unread.filter((n) => n.severity === 'urgent').length };
}

// ---------------------------------------------------------------------
// The app-open prompt
// ---------------------------------------------------------------------

export interface PromptMemory {
  /** "Later" taps in a row, in sessions where nothing was urgent. */
  laterStreak: number;
}

/**
 * Show the prompt? Once per session, only with unread notifications, never
 * over a form or side peek (it waits). After three "Later"s in a row with
 * nothing urgent, only the bell badge shows until something urgent arrives.
 */
export function shouldPrompt(input: { unread: number; urgent: number; shownThisSession: boolean; overlayOpen: boolean; memory: PromptMemory }): boolean {
  if (input.shownThisSession || input.overlayOpen || input.unread === 0) return false;
  if (input.urgent > 0) return true;
  return input.memory.laterStreak < 3;
}

/** After the prompt is answered. */
export function afterPrompt(memory: PromptMemory, choice: 'view' | 'later', urgent: number): PromptMemory {
  if (choice === 'view') return { laterStreak: 0 };
  return { laterStreak: urgent > 0 ? memory.laterStreak : memory.laterStreak + 1 };
}

/** "You have 6 unread updates, 2 urgent." */
export function promptText(unread: number, urgent: number): string {
  const base = `You have ${unread} unread ${unread === 1 ? 'update' : 'updates'}`;
  return urgent ? `${base}, ${urgent} urgent.` : `${base}.`;
}
