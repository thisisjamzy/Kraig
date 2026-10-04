// What to write so the stored notifications match what the rules say should
// exist. Pure, tested in test/notifications.test.ts.
//   - Upsert by group key: the same situation never makes a duplicate; when
//     its details change (7 overdue becomes 8) the existing one updates, and
//     when a new item joins it's unread again.
//   - A condition that no longer applies (the rules stop producing it) is
//     resolved: out of the inbox into Resolved, kept 30 days, then deleted.
//     A message (morning summary, a milestone) resolves when it expires.
//   - A resolved one whose condition comes back reopens, unread.
//   - Archived stays archived unless a new item joins.
//   - Muted types: nothing new is created; existing ones stay until resolved.

import { notificationId, type NotificationDraft, type NotificationPrefs, type StoredNotification } from './types';

export type NotificationWrite =
  | { op: 'create'; id: string; data: StoredNotification }
  | { op: 'update'; id: string; data: Partial<StoredNotification> }
  | { op: 'delete'; id: string };

export const RESOLVED_KEEP_DAYS = 30;

/** What the reader sees changing: the words, and each item's key and amount. */
function signature(n: Pick<NotificationDraft, 'title' | 'body' | 'severity' | 'items'>): string {
  return JSON.stringify([n.title, n.body, n.severity, n.items.map((i) => [i.key, i.amount, i.label])]);
}

export function reconcileNotifications(
  existing: StoredNotification[],
  desired: NotificationDraft[],
  prefs: Pick<NotificationPrefs, 'muted'>,
  now: Date
): NotificationWrite[] {
  const writes: NotificationWrite[] = [];
  const byId = new Map(existing.map((n) => [n.id, n]));
  const wanted = new Set<string>();
  const muted = new Set(prefs.muted);

  for (const draft of desired) {
    const id = notificationId(draft.groupKey);
    if (wanted.has(id)) continue;
    wanted.add(id);
    const current = byId.get(id);
    if (!current) {
      if (muted.has(draft.type)) continue;
      writes.push({
        op: 'create',
        id,
        data: { ...draft, id, createdAt: now, updatedAt: now, readAt: null, resolvedAt: null, snoozedUntil: null, archivedAt: null },
      });
      continue;
    }
    const before = new Set(current.items.map((i) => i.key));
    const newItems = draft.items.some((i) => !before.has(i.key));
    const changed = signature(current) !== signature(draft);
    const reopen = current.resolvedAt !== null;
    if (!changed && !reopen) continue;
    // A message that already ran its course stays resolved.
    if (reopen && current.expiresAt && current.expiresAt <= now) continue;
    const patch: Partial<StoredNotification> = {
      title: draft.title,
      body: draft.body,
      severity: draft.severity,
      items: draft.items,
      primaryAction: draft.primaryAction,
      secondaryActions: draft.secondaryActions,
      expiresAt: draft.expiresAt,
      updatedAt: now,
    };
    if (reopen) {
      patch.resolvedAt = null;
      patch.readAt = null;
      patch.archivedAt = null;
    } else if (newItems) {
      patch.readAt = null;
      patch.archivedAt = null;
    }
    writes.push({ op: 'update', id, data: patch });
  }

  const purgeBefore = now.getTime() - RESOLVED_KEEP_DAYS * 86_400_000;
  for (const n of existing) {
    if (n.resolvedAt) {
      if (n.resolvedAt.getTime() < purgeBefore && !wanted.has(n.id)) writes.push({ op: 'delete', id: n.id });
      continue;
    }
    const expired = n.expiresAt !== null && n.expiresAt <= now;
    // Messages aren't conditions: absence doesn't resolve them, expiry does.
    if (expired || (!wanted.has(n.id) && n.expiresAt === null)) {
      writes.push({ op: 'update', id: n.id, data: { resolvedAt: now, updatedAt: now } });
    }
  }
  return writes;
}
