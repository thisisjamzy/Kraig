'use client';

// Insights notifications. They're shown by the installed PWA's service
// worker (so tapping one opens the right page — see worker/index.ts), or as
// an in-app toast when notifications aren't allowed.
//
// They're checked while the app is open (InsightsNotifier): true background
// push, delivered with the app closed, would need Firebase Cloud Messaging
// and a scheduled Cloud Function, which this doesn't set up.

import { showToast } from '@/src/widgets/Toast/Toast';

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function notify(title: string, body: string, url: string, tag: string): Promise<void> {
  if (notificationPermission() === 'granted') {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.showNotification(title, { body, tag, data: { url }, icon: '/icons/icon-192.png' });
        return;
      }
      const n = new Notification(title, { body, tag });
      n.onclick = () => {
        window.focus();
        window.location.href = url;
      };
      return;
    } catch {
      // Fall through to the in-app toast.
    }
  }
  showToast(`${title} — ${body}`);
}
