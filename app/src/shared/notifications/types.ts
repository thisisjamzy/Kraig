// Notifications: everything that asks for attention or action, in one place
// (users/{uid}/notifications/{id}). The rules module (rules.ts) turns facts
// about the household's money and time into the notifications that should
// exist; reconcile.ts diffs those against what's stored. Pure.

export type NotificationModule = 'money' | 'time' | 'system';
export type NotificationSeverity = 'urgent' | 'warning' | 'info' | 'positive';

export const NOTIFICATION_TYPES = [
  // Money
  'payment_overdue',
  'payment_due_soon',
  'overspend_uncovered',
  'leftover_to_reallocate',
  'must_haves_short',
  'income_late',
  'income_received',
  'ready_to_pay',
  'month_review',
  'unassigned_transactions',
  'reconcile_mismatch',
  'debt_payment_due',
  'debt_payment_late',
  'savings_behind',
  'spending_off_pace',
  'forecast_below_cushion',
  'forecast_below_zero',
  'forecast_month_short',
  'auto_allocate_ready',
  'want_to_buy_fits',
  'cushion_streak',
  // Time
  'tasks_overdue',
  'tasks_due_today',
  'projects_at_risk',
  'milestones_at_risk',
  'day_overloaded',
  'do_first_heavy',
  'calendar_conflict',
  'streak_broken',
  'morning_summary',
  'evening_nudge',
  // System
  'calendar_sync_failed',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationItem {
  /** Stable per entity and period ("payment_overdue:rent@2026-10"). */
  key: string;
  entityType: 'line' | 'debt' | 'task' | 'project' | 'milestone' | 'day' | 'account' | 'transaction' | 'month' | 'plan' | 'queue' | 'series' | 'event';
  entityId: string;
  label: string;
  amount: number | null;
  date: Date | null;
  /** The item's own action ("Mark paid" on one payment). */
  action: NotificationAction | null;
}

/**
 * An action: a route to open, or a handler run in place. Handlers are
 * named, never functions, so a notification can be stored.
 */
export interface NotificationAction {
  label: string;
  route?: string;
  handler?: 'markPaid' | 'markRead';
  params?: Record<string, string | number>;
}

/** What the rules say should exist. */
export interface NotificationDraft {
  type: NotificationType;
  module: NotificationModule;
  severity: NotificationSeverity;
  /** type + entity + period; for a batch, the batch's own key. */
  dedupeKey: string;
  /** Similar items batch under one notification with this key. */
  groupKey: string;
  title: string;
  body: string;
  items: NotificationItem[];
  primaryAction: NotificationAction | null;
  secondaryActions: NotificationAction[];
  /**
   * A message rather than a condition (morning summary, a milestone
   * reached): it isn't resolved when the rules stop producing it, only
   * when it expires.
   */
  expiresAt: Date | null;
}

/** As stored. */
export interface StoredNotification extends NotificationDraft {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
  snoozedUntil: Date | null;
  archivedAt: Date | null;
}

/** users/{uid}/settings/notifications */
export interface NotificationPrefs {
  /** Types switched off: no new ones are created (existing ones stay until resolved). */
  muted: NotificationType[];
  /** Types that also send a push notification. */
  push: NotificationType[];
  /** Types that also send an email (stored; sending needs a server). */
  email: NotificationType[];
  /** "08:00": when the morning summary is written. */
  summaryTime: string;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  muted: [],
  push: ['payment_overdue', 'debt_payment_late', 'forecast_below_zero', 'projects_at_risk', 'spending_off_pace', 'morning_summary', 'evening_nudge', 'calendar_sync_failed'],
  email: [],
  summaryTime: '08:00',
};

export const MODULE_OF: Record<NotificationType, NotificationModule> = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [
    t,
    t === 'calendar_sync_failed'
      ? 'system'
      : [
            'tasks_overdue',
            'tasks_due_today',
            'projects_at_risk',
            'milestones_at_risk',
            'day_overloaded',
            'do_first_heavy',
            'calendar_conflict',
            'streak_broken',
            'morning_summary',
            'evening_nudge',
          ].includes(t)
        ? 'time'
        : 'money',
  ])
) as Record<NotificationType, NotificationModule>;

/** Sentence-case names for Settings and filters. */
export const TYPE_LABEL: Record<NotificationType, string> = {
  payment_overdue: 'Overdue payments',
  payment_due_soon: 'Payments due soon',
  overspend_uncovered: 'Overspend to cover or justify',
  leftover_to_reallocate: 'Leftover money to reallocate',
  must_haves_short: 'Must-haves short or waiting',
  income_late: 'Late income',
  income_received: 'Income received',
  ready_to_pay: 'Ready to pay',
  month_review: 'New month to review',
  unassigned_transactions: 'Transactions without a bucket',
  reconcile_mismatch: 'Balances to reconcile',
  debt_payment_due: 'Debt payments due',
  debt_payment_late: 'Late debt payments',
  savings_behind: 'Savings behind plan',
  spending_off_pace: 'Spending off pace',
  forecast_below_cushion: 'Forecast below your cushion',
  forecast_below_zero: 'Forecast below zero',
  forecast_month_short: 'Months that don’t fit the plan',
  auto_allocate_ready: 'Backlog items that now fit',
  want_to_buy_fits: 'Want to buy items that fit',
  cushion_streak: 'Cushion streak milestones',
  tasks_overdue: 'Overdue tasks',
  tasks_due_today: 'Tasks due today',
  projects_at_risk: 'Projects at risk',
  milestones_at_risk: 'Milestones missed or at risk',
  day_overloaded: 'Overloaded days',
  do_first_heavy: 'Do first work taking over',
  calendar_conflict: 'Calendar conflicts',
  streak_broken: 'Streaks broken',
  morning_summary: 'Morning summary',
  evening_nudge: 'Evening nudge',
  calendar_sync_failed: 'Google Calendar sync problems',
};

export const SEVERITY_RANK: Record<NotificationSeverity, number> = { urgent: 0, warning: 1, info: 2, positive: 3 };

/** A Firestore-safe document id for a group key. */
export function notificationId(groupKey: string): string {
  return groupKey.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 300);
}

/**
 * users/{uid}/settings/planSnapshot: the applied plan's forecast facts
 * (never the draft) and the balance audit, written by the Plan and forecast
 * page and once a day in the background (src/widgets/Notifications/
 * PlanSnapshotWorker.tsx), read by the notification runner, which then
 * doesn't need every transaction loaded on every page.
 */
export interface PlanSnapshot {
  computedAt: Date;
  forecast: import('./rules').ForecastFacts;
  reconcile: { accountId: string; name: string; difference: number }[];
}
