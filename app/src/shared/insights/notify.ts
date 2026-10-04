'use client';

// Push notifications, for the types set to push in Settings > Notifications
// (src/widgets/Notifications/NotificationsRunner.tsx). They're shown by the
// installed PWA's service worker (so tapping one opens the right page, see
// worker/index.ts). When pushes aren't allowed nothing is shown here: the
// same notification is already in the Notifications inbox, and an
// unprompted toast is exactly the kind of alert the app no longer shows.
//
// They're sent while the app is open: true background push, delivered with
// the app closed, would need Firebase Cloud Messaging and a scheduled Cloud
// Function, which this doesn't set up.

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
      // Not shown; it's in the inbox.
    }
  }
}
