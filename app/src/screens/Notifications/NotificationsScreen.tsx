'use client';

// Notifications (src/logic/notifications): every alert in the app, batched
// and actionable, as a Notion page. Properties: Unread, Urgent, Money,
// Time, Resolved this week. The shared toolbar with the view selector
// (Inbox, Unread, Snoozed, Resolved, Archived), filter, sort (Priority or
// Newest), search and "Mark all as read". Rows grouped by Today, Yesterday,
// This week and Earlier: severity icon, title (bold with a blue dot while
// unread), one line of body, module chip, time, the primary action and
// "..."; a batch shows its count and expands to its items. A row opens in a
// side peek with everything and marks itself read.

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronRight, Circle, MoreHorizontal, Settings2 } from 'lucide-react';
import { useLogic, FIELDS, type NotificationsLogic } from '@/src/logic/notifications/useLogic';
import { relativeTime, VIEW_LABEL, type InboxView } from '@/src/shared/notifications/inbox';
import type { NotificationSeverity, StoredNotification } from '@/src/shared/notifications/types';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { SidePeek } from '@/src/widgets/Database/SidePeek';
import { ListQueryBar } from '@/src/widgets/ListQuery/ListQueryBar';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Tag } from '@/src/widgets/TaskDb/Tag';
import { formatMoney } from '@/src/widgets/Money/Money';
import db from '@/src/widgets/Database/Database.module.css';
import styles from './NotificationsScreen.module.css';

const VIEWS: InboxView[] = ['inbox', 'unread', 'snoozed', 'resolved', 'archived'];
const MODULE_LABEL = { money: 'Money', time: 'Time', system: 'System' } as const;

export function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  const label = { urgent: 'Urgent', warning: 'Warning', info: 'Info', positive: 'Positive' }[severity];
  return (
    <span className={styles.severity} data-severity={severity} role="img" aria-label={label}>
      {severity === 'urgent' ? (
        <Circle size={14} strokeWidth={0} fill="currentColor" />
      ) : severity === 'warning' ? (
        <AlertTriangle size={15} strokeWidth={2.25} />
      ) : severity === 'positive' ? (
        <CheckCircle2 size={15} strokeWidth={2.25} />
      ) : (
        <span className={styles.infoDot} />
      )}
    </span>
  );
}

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Items({ n, v }: { n: StoredNotification; v: NotificationsLogic }) {
  return (
    <ul className={styles.items}>
      {n.items.map((item) => (
        <li key={item.key}>
          <span className={styles.itemLabel}>{item.label}</span>
          <span className={styles.itemMeta}>
            {item.amount !== null && <span className={styles.itemAmount}>{formatMoney(item.amount)}</span>}
            {item.date && <span>{day(item.date)}</span>}
          </span>
          {item.action && (
            <button type="button" className={styles.smallButton} onClick={() => void v.runAction(item.action!, n)}>
              {item.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RowMenu({ n, v, anchor, onClose }: { n: StoredNotification; v: NotificationsLogic; anchor: HTMLElement; onClose: () => void }) {
  const row = (label: string, run: () => unknown) => (
    <button
      type="button"
      className={db.menuRow}
      data-row
      onClick={() => {
        onClose();
        void run();
      }}
    >
      {label}
    </button>
  );
  return (
    <Popover anchor={anchor} label="Notification options" onClose={onClose}>
      <div className={db.menu}>
        {n.readAt ? row('Mark as unread', () => v.markRead(n.id, false)) : row('Mark as read', () => v.markRead(n.id))}
        {!n.resolvedAt && row('Snooze 1 day', () => v.snooze(n.id, 1))}
        {!n.resolvedAt && row('Snooze 1 week', () => v.snooze(n.id, 7))}
        {n.archivedAt || n.snoozedUntil ? row('Move to inbox', () => v.unarchive(n.id)) : !n.resolvedAt && row('Archive', () => v.archive(n.id))}
        {row('Mute this type', () => v.mute(n.type))}
      </div>
    </Popover>
  );
}

function Row({ n, v }: { n: StoredNotification; v: NotificationsLogic }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const open = v.expanded.has(n.id);
  const unread = !n.readAt && !n.resolvedAt;
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <li className={styles.row} data-unread={unread || undefined} data-selected={v.selected.has(n.id) || undefined}>
      <div
        className={styles.rowMain}
        role="button"
        tabIndex={0}
        onClick={() => v.openPeek(n)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            v.openPeek(n);
          }
        }}
      >
        <input type="checkbox" className={styles.check} checked={v.selected.has(n.id)} onChange={() => v.toggleSelected(n.id)} onClick={stop} aria-label={`Select ${n.title}`} />
        <SeverityIcon severity={n.severity} />
        <div className={styles.text}>
          <div className={styles.titleLine}>
            {unread && <span className={styles.unreadDot} aria-label="Unread" />}
            <span className={styles.title}>{n.title}</span>
          </div>
          {n.body && <p className={styles.body}>{n.body}</p>}
          <div className={styles.meta}>
            <Tag color={n.module === 'money' ? 'green' : n.module === 'time' ? 'blue' : 'gray'}>{MODULE_LABEL[n.module]}</Tag>
            {n.items.length > 1 && (
              <button
                type="button"
                className={styles.count}
                aria-expanded={open}
                onClick={(e) => {
                  stop(e);
                  v.toggleExpanded(n.id);
                }}
              >
                {open ? <ChevronDown size={13} strokeWidth={2.25} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.25} aria-hidden />}
                {n.items.length} items
              </button>
            )}
            <time dateTime={n.updatedAt.toISOString()}>{relativeTime(n.updatedAt, v.now)}</time>
          </div>
        </div>
        <div className={styles.actions} onClick={stop}>
          {n.primaryAction && !n.resolvedAt && (
            <button type="button" className={styles.smallButton} onClick={() => void v.runAction(n.primaryAction!, n)}>
              {n.primaryAction.label}
            </button>
          )}
          <button type="button" className={styles.iconButton} aria-label="Options" onClick={(e) => setMenu(e.currentTarget)}>
            <MoreHorizontal size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      {open && <Items n={n} v={v} />}
      {menu && <RowMenu n={n} v={v} anchor={menu} onClose={() => setMenu(null)} />}
    </li>
  );
}

function Peek({ n, v }: { n: StoredNotification; v: NotificationsLogic }) {
  const [mode, setMode] = useState<'side' | 'center'>('side');
  return (
    <SidePeek title={n.title} mode={mode} onMode={(m) => setMode(m === 'center' ? 'center' : 'side')} onClose={v.closePeek} fullHref={null}>
      <div className={styles.peek}>
        <div className={styles.peekHead}>
          <SeverityIcon severity={n.severity} />
          <h2>{n.title}</h2>
        </div>
        <p className={styles.peekBody}>{n.body}</p>
        <p className={styles.peekMeta}>
          {MODULE_LABEL[n.module]} · {relativeTime(n.updatedAt, v.now)}
          {n.resolvedAt ? ` · Resolved ${relativeTime(n.resolvedAt, v.now).toLowerCase()}` : ''}
        </p>
        {n.items.length > 0 && <Items n={n} v={v} />}
        <div className={styles.peekActions}>
          {n.primaryAction && !n.resolvedAt && (
            <button type="button" className={styles.primary} onClick={() => void v.runAction(n.primaryAction!, n)}>
              {n.primaryAction.label}
            </button>
          )}
          {n.secondaryActions.map((a) => (
            <button key={a.label} type="button" className={styles.secondary} onClick={() => void v.runAction(a, n)}>
              {a.label}
            </button>
          ))}
        </div>
        <div className={styles.peekLinks}>
          {!n.resolvedAt && (
            <>
              <button type="button" className={styles.link} onClick={() => v.snooze(n.id, 1)}>
                Snooze 1 day
              </button>
              <button type="button" className={styles.link} onClick={() => void v.archive(n.id).then(v.closePeek)}>
                Archive
              </button>
            </>
          )}
          <button type="button" className={styles.link} onClick={() => v.mute(n.type)}>
            Mute this type
          </button>
        </div>
      </div>
    </SidePeek>
  );
}

export function NotificationsScreen() {
  const v = useLogic();
  const c = v.counts;
  const selected = [...v.selected];

  return (
    <NotionPage
      title="Notifications"
      icon={<Bell strokeWidth={1.75} />}
      crumbs={[{ label: 'Notifications' }]}
      menu={[
        { label: 'Mark all as read', onSelect: () => void v.markAllRead() },
        { label: 'Notification settings', href: '/settings/notifications' },
      ]}
      properties={[
        { id: 'unread', label: 'Unread', display: String(c.unread) },
        { id: 'urgent', label: 'Urgent', tone: c.urgent > 0 ? 'bad' : 'neutral', display: String(c.urgent) },
        { id: 'money', label: 'Money', display: String(c.money) },
        { id: 'time', label: 'Time', display: String(c.time) },
        { id: 'resolved', label: 'Resolved this week', tone: c.resolvedThisWeek ? 'good' : 'neutral', display: String(c.resolvedThisWeek) },
      ]}
    >
      <section className={styles.list} aria-label="Notifications">
        <ListQueryBar<StoredNotification>
          fields={FIELDS}
          query={v.list.query}
          setQuery={v.list.setQuery}
          onClear={v.list.clear}
          count={v.rows.length}
          noun={['notification', 'notifications']}
          leading={
            <label className={styles.viewSelect}>
              <select value={v.view} onChange={(e) => v.setView(e.target.value as InboxView)} aria-label="View">
                {VIEWS.map((view) => (
                  <option key={view} value={view}>
                    {VIEW_LABEL[view]} ({c.byView[view]})
                  </option>
                ))}
              </select>
            </label>
          }
          hideSort
          trailing={
            <span className={styles.tools}>
              <select value={v.sort} onChange={(e) => v.setSort(e.target.value as 'priority' | 'newest')} aria-label="Sort" className={styles.sortSelect}>
                <option value="priority">Priority</option>
                <option value="newest">Newest</option>
              </select>
              <Link href="/settings/notifications" className={styles.iconButton} aria-label="Notification settings" title="Notification settings">
                <Settings2 size={16} strokeWidth={2} />
              </Link>
              <button type="button" className={styles.smallButton} onClick={() => void v.markAllRead()} disabled={c.unread === 0}>
                Mark all as read
              </button>
            </span>
          }
        />

        {selected.length > 0 && (
          <div className={styles.bulk} role="toolbar" aria-label="Selected notifications">
            <span>{selected.length} selected</span>
            <button type="button" onClick={() => void v.markRead(selected)}>
              Mark read
            </button>
            <button type="button" onClick={() => void v.snooze(selected, 1)}>
              Snooze 1 day
            </button>
            <button type="button" onClick={() => void v.snooze(selected, 7)}>
              Snooze 1 week
            </button>
            <button type="button" onClick={() => void v.archive(selected)}>
              Archive
            </button>
            <button type="button" className={styles.link} onClick={v.clearSelection}>
              Clear
            </button>
          </div>
        )}

        {v.loading ? (
          <ScreenState loading />
        ) : v.rows.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden />
            <p>{v.view === 'inbox' || v.view === 'unread' ? 'You’re all caught up.' : `Nothing in ${VIEW_LABEL[v.view]}.`}</p>
          </div>
        ) : (
          v.groups.map((g) => (
            <div key={g.group} className={styles.group}>
              <h2 className={styles.groupTitle}>{g.group}</h2>
              <ul className={styles.rows}>
                {g.rows.map((n) => (
                  <Row key={n.id} n={n} v={v} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      {v.peek && <Peek n={v.peek} v={v} />}
    </NotionPage>
  );
}
