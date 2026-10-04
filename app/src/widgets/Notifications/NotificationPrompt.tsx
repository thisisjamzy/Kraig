'use client';

// The app-open prompt: on the first screen of a session, after it has
// rendered (never in the way of signing in), when there are unread
// notifications: "You have 6 unread updates, 2 urgent." with "View
// notifications" and "Later". A small card at the bottom left on medium
// screens and up (bottom center when the sidebar is collapsed), a small
// bottom sheet on a phone (one line, View and Later). Once a session; it
// waits while a form or side peek is open. After three "Later"s in a row
// with nothing urgent, only the bell badge shows until something urgent
// arrives (inbox.ts's shouldPrompt).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { isFormPage } from '@/src/shared/navigation/navHistory';
import { afterPrompt, promptText, shouldPrompt, unreadCount, type PromptMemory } from '@/src/shared/notifications/inbox';
import styles from './NotificationPrompt.module.css';
import { usePreferences } from '@/src/shared/firestore/preferences';

const SESSION_KEY = 'dreda.notifyPrompt.shown';
const MEMORY_KEY = 'dreda.notifyPrompt';

function readMemory(): PromptMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? (JSON.parse(raw) as PromptMemory) : { laterStreak: 0 };
  } catch {
    return { laterStreak: 0 };
  }
}
function shownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
function remember(memory: PromptMemory) {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Not remembered: it may show again next session, which is harmless.
  }
}

/** A form page, a side peek, a panel or a dialog is open. */
function overlayOpen(pathname: string): boolean {
  if (isFormPage(pathname)) return true;
  return Boolean(document.querySelector('[data-panel-open], [role="dialog"], [aria-modal="true"]'));
}

export interface PhonePromptProps {
  unread: number;
  urgent: number;
  onView: () => void;
  onLater: () => void;
}

/** `phone` renders the phone line's sheet (passed in by the app layout). */
export function NotificationPrompt({ phone }: { phone: (props: PhonePromptProps) => ReactNode }) {
  const { notifications, loading } = useNotifications();
  const { prefs } = usePreferences();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { isWide } = useLayout();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const counts = useMemo(() => unreadCount(notifications, new Date()), [notifications]);

  // Decide after the first render, and keep checking while a form or peek
  // is in the way. Opening Notifications itself counts as seeing them.
  useEffect(() => {
    if (done || open || loading) return;
    // Turned off in Settings > Notifications: only the bell's badge.
    if (!prefs.appOpenPrompt) return;
    if (pathname.startsWith('/notifications')) {
      remember({ laterStreak: 0 });
      const frame = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(frame);
    }
    const check = () => {
      if (shownThisSession()) return setDone(true);
      const blocked = overlayOpen(pathname);
      // A form or peek in the way: wait. Nothing unread yet: keep watching.
      if (blocked || counts.unread === 0) return;
      if (shouldPrompt({ unread: counts.unread, urgent: counts.urgent, shownThisSession: false, overlayOpen: false, memory: readMemory() })) {
        setSidebarCollapsed(!document.querySelector('nav[aria-label="Main navigation"]'));
        setOpen(true);
      } else {
        // Quiet after three "Later"s: only the badge until something urgent.
        setDone(true);
      }
    };
    const first = window.setTimeout(check, 1200);
    const again = window.setInterval(check, 1500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(again);
    };
  }, [done, open, loading, pathname, counts, prefs.appOpenPrompt]);

  if (!open) return null;

  function answer(choice: 'view' | 'later') {
    remember(afterPrompt(readMemory(), choice, counts.urgent));
    setOpen(false);
    setDone(true);
    if (choice === 'view') router.push('/notifications');
  }

  const text = promptText(counts.unread, counts.urgent);
  if (isWide) {
    return (
      <div className={styles.card} data-centered={sidebarCollapsed || undefined} role="dialog" aria-label="Unread notifications">
        <p>{text}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={() => answer('view')}>
            View notifications
          </button>
          <button type="button" className={styles.secondary} onClick={() => answer('later')}>
            Later
          </button>
        </div>
      </div>
    );
  }
  return phone({ unread: counts.unread, urgent: counts.urgent, onView: () => answer('view'), onLater: () => answer('later') });
}
