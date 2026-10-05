'use client';

// The Notifications page: the household's notifications in views (Inbox,
// Unread, Snoozed, Resolved, Archived), filtered, sorted (Priority or
// Newest) and searched with the shared toolbar, grouped by Today,
// Yesterday, This week and Earlier. Rows expand to their items; a row opens
// in a side peek and is marked read. Read and unread, snooze, archive and
// mute, one at a time or selected together. Actions open their page, or
// run in place ("Mark paid").

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { useListQuery, useQueried } from '@/src/shared/listQuery/useListQuery';
import { EMPTY_QUERY, type FieldDef } from '@/src/shared/listQuery/engine';
import {
  archiveNotifications,
  markNotificationsRead,
  setTypeMuted,
  snoozeNotifications,
  unarchiveNotifications,
} from '@/src/shared/firestore/notificationWrites';
import { compareNewest, comparePriority, DAY_GROUPS, dayGroup, inView, unreadCount, type DayGroup, type InboxView } from '@/src/shared/notifications/inbox';
import { NOTIFICATION_TYPES, TYPE_LABEL, type NotificationAction, type NotificationType, type StoredNotification } from '@/src/shared/notifications/types';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { monthKeyOf } from '@/src/shared/budget/monthBudget';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import { showToast } from '@/src/widgets/Toast/Toast';

const VIEW_KEY = 'dreda.notifications.view';
const SORT_KEY = 'dreda.notifications.sort';

function readLocal<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; harmless.
  }
}

export const FIELDS: FieldDef<StoredNotification>[] = [
  { id: 'title', label: 'Title', type: 'text', get: (n) => `${n.title} ${n.body} ${n.items.map((i) => i.label).join(' ')}`, searchable: true, sortable: false },
  {
    id: 'module',
    label: 'Module',
    type: 'select',
    get: (n) => n.module,
    options: [
      { value: 'money', label: 'Money' },
      { value: 'time', label: 'Time' },
      { value: 'system', label: 'System' },
    ],
  },
  {
    id: 'severity',
    label: 'Severity',
    type: 'select',
    get: (n) => n.severity,
    options: [
      { value: 'urgent', label: 'Urgent' },
      { value: 'warning', label: 'Warning' },
      { value: 'info', label: 'Info' },
      { value: 'positive', label: 'Positive' },
    ],
  },
  { id: 'type', label: 'Type', type: 'select', get: (n) => n.type, options: NOTIFICATION_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })) },
  { id: 'date', label: 'Date', type: 'date', get: (n) => n.updatedAt },
];

const VIEWS: InboxView[] = ['inbox', 'unread', 'snoozed', 'resolved', 'archived'];
const SORTS = ['priority', 'newest'] as const;
export type SortId = (typeof SORTS)[number];

export function useLogic() {
  const router = useRouter();
  const { uid, notifications, prefs, loading } = useNotifications();
  const [view, setViewState] = useState<InboxView>('inbox');
  const [sort, setSortState] = useState<SortId>('priority');
  // The remembered view and sort, after the first paint (the server renders the defaults).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setViewState(readLocal(VIEW_KEY, 'inbox', VIEWS));
      setSortState(readLocal(SORT_KEY, 'priority', SORTS));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const list = useListQuery<StoredNotification>({ listId: 'notifications', fields: FIELDS, defaults: EMPTY_QUERY });
  const now = useMemo(() => new Date(), [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  const inThisView = useMemo(() => notifications.filter((n) => inView(n, view, now)), [notifications, view, now]);
  const queried = useQueried(inThisView, FIELDS, list.query);
  const rows = useMemo(() => [...queried].sort(sort === 'priority' ? comparePriority : compareNewest), [queried, sort]);
  const groups = useMemo(() => {
    const out: { group: DayGroup; rows: StoredNotification[] }[] = [];
    for (const g of DAY_GROUPS) {
      const inGroup = rows.filter((n) => dayGroup(n.updatedAt, now) === g);
      if (inGroup.length) out.push({ group: g, rows: inGroup });
    }
    return out;
  }, [rows, now]);

  const counts = useMemo(() => {
    const open = notifications.filter((n) => inView(n, 'inbox', now));
    const weekAgo = now.getTime() - 7 * 86_400_000;
    return {
      ...unreadCount(notifications, now),
      money: open.filter((n) => n.module === 'money').length,
      time: open.filter((n) => n.module === 'time').length,
      resolvedThisWeek: notifications.filter((n) => n.resolvedAt && n.resolvedAt.getTime() >= weekAgo).length,
      byView: Object.fromEntries(VIEWS.map((v) => [v, notifications.filter((n) => inView(n, v, now)).length])) as Record<InboxView, number>,
    };
  }, [notifications, now]);

  // "Mark paid" runs here: this month's budget, as the Budget page does.
  const month = monthKeyOf(now);
  const budget = useBudgetMonth(month, useMonthBudget(month));

  async function guard(run: () => Promise<unknown>, fallback: string) {
    try {
      await run();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : fallback);
    }
  }

  async function runAction(action: NotificationAction, n?: StoredNotification) {
    if (n && !n.readAt && uid) void markNotificationsRead(uid, [n.id]);
    if (action.route) {
      router.push(action.route);
      return;
    }
    if (action.handler === 'markPaid') {
      const p = action.params ?? {};
      const row = [...budget.rows.Expense, ...budget.rows.Savings, ...budget.rows.Transfer].find((r) => r.bucketId === p.bucketId && r.itemId === p.itemId && r.month === p.month);
      if (!row) return showToast('That line isn’t in this month’s budget any more.');
      await guard(async () => {
        await budget.markPaid(row);
        showToast(`${row.name} marked paid`);
      }, 'Could not mark that paid.');
      return;
    }
    if (action.handler === 'markRead' && n && uid) await markNotificationsRead(uid, [n.id]);
  }

  const ids = (target: string | string[]) => (Array.isArray(target) ? target : [target]);
  const doneSelecting = () => setSelected(new Set());
  async function act(run: () => Promise<unknown>, fallback: string): Promise<void> {
    if (!uid) return;
    await guard(run, fallback);
    doneSelecting();
  }

  return {
    loading,
    view,
    setView: (v: InboxView) => {
      setViewState(v);
      writeLocal(VIEW_KEY, v);
      doneSelecting();
    },
    sort,
    setSort: (s: SortId) => {
      setSortState(s);
      writeLocal(SORT_KEY, s);
    },
    list,
    /** Every notification, in any view (a phone's detail page finds one here). */
    all: notifications,
    rows,
    groups,
    counts,
    prefs,
    now,
    // Selection
    selected,
    toggleSelected: (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    clearSelection: doneSelecting,
    // Expansion and the peek
    expanded,
    toggleExpanded: (id: string) =>
      setExpanded((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    peek: notifications.find((n) => n.id === peekId) ?? null,
    openPeek: (n: StoredNotification) => {
      setPeekId(n.id);
      if (!n.readAt && uid) void markNotificationsRead(uid, [n.id]);
    },
    closePeek: () => setPeekId(null),
    // Actions
    runAction,
    markRead: (target: string | string[], read = true) => act(() => markNotificationsRead(uid!, ids(target), read), 'Could not update that.'),
    snooze: (target: string | string[], days: number) =>
      act(async () => {
        await snoozeNotifications(uid!, ids(target), new Date(Date.now() + days * 86_400_000));
        showToast(days === 1 ? 'Snoozed until tomorrow' : 'Snoozed for a week');
      }, 'Could not snooze that.'),
    archive: (target: string | string[]) => act(() => archiveNotifications(uid!, ids(target)), 'Could not archive that.'),
    unarchive: (target: string | string[]) => act(() => unarchiveNotifications(uid!, ids(target)), 'Could not move that back.'),
    mute: (type: NotificationType) =>
      act(async () => {
        await setTypeMuted(uid!, type, true);
        showToast(`${TYPE_LABEL[type]} muted. Turn it back on in Settings.`);
      }, 'Could not mute that.'),
    markAllRead: () => act(() => markNotificationsRead(uid!, notifications.filter((n) => inView(n, 'unread', now)).map((n) => n.id)), 'Could not update them.'),
  };
}

export type NotificationsLogic = ReturnType<typeof useLogic>;
