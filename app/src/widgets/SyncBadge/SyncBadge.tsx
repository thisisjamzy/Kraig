'use client';

// A pushed task's Google Calendar state, as a tiny badge on its card —
// nothing once synced. Always an icon plus a label (never color alone),
// with a 44px tap area:
//   - clock "syncing": on its way to Google;
//   - warning "sync error": tap for the message and Retry;
//   - two squares "conflict": a Google event was booked over it in the
//     seconds before the block reached Google — tap to list them.
// See syncBadgeFor (src/shared/calendarSync/badge.ts) for which applies.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Copy, TriangleAlert } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import { syncNow } from '@/src/widgets/CalendarSyncStatus/syncNow';
import type { TaskSyncBadge } from '@/src/shared/calendarSync/badge';
import styles from './SyncBadge.module.css';

function clock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function day(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const LABEL = { pending: 'syncing', error: 'sync error', conflict: 'conflict' } as const;

export function SyncBadge({ badge, compact = false }: { badge: TaskSyncBadge; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const Icon = badge.kind === 'pending' ? Clock3 : badge.kind === 'error' ? TriangleAlert : Copy;

  async function retry() {
    setRetrying(true);
    try {
      await syncNow();
    } finally {
      setRetrying(false);
      setOpen(false);
    }
  }

  const title =
    badge.kind === 'pending' ? 'Syncing with Google Calendar' : badge.kind === 'error' ? "Couldn't sync with Google Calendar" : 'Overlaps Google Calendar';

  return (
    <>
      <button
        type="button"
        className={styles.badge}
        data-kind={badge.kind}
        data-compact={compact || undefined}
        onClick={() => setOpen(true)}
        aria-label={`Google Calendar: ${LABEL[badge.kind]}`}
      >
        <Icon size={11} strokeWidth={2.5} aria-hidden />
        {!compact && <span>{LABEL[badge.kind]}</span>}
      </button>
      {open &&
        createPortal(
          <Modal title={title} onClose={() => setOpen(false)}>
            <div className={styles.sheet}>
              {badge.kind === 'pending' && (
                <p className={styles.text}>
                  This task is on its way to Google Calendar as Busy, so no one can book over it. It usually takes a few
                  seconds once you&apos;re online.
                </p>
              )}
              {badge.kind === 'error' && (
                <>
                  <p className={styles.text}>{badge.message}</p>
                  <button type="button" className={styles.primary} onClick={retry} disabled={retrying}>
                    {retrying ? 'Retrying…' : 'Retry'}
                  </button>
                </>
              )}
              {badge.kind === 'conflict' && (
                <>
                  <p className={styles.text}>
                    Something was booked in Google Calendar at the same time, just before this task reached it. Move
                    this task, or the event in Google.
                  </p>
                  <ul className={styles.list}>
                    {badge.conflicts.map((c) => (
                      <li key={`${c.googleEventId}-${c.start}`}>
                        <GoogleMark size={14} />
                        <span className={styles.listTitle}>{c.title}</span>
                        <span className={styles.listTime}>
                          {day(c.start)} · {clock(c.start)} to {clock(c.end)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Modal>,
          document.body
        )}
    </>
  );
}
