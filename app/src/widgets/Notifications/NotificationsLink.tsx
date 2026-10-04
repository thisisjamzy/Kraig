'use client';

// The end of a page's neutral callout: "3 updates about this page in
// Notifications", counting the open notifications that page cares about
// (by module or type). Nothing when there are none.

import Link from 'next/link';
import { useMemo } from 'react';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { inView } from '@/src/shared/notifications/inbox';
import type { NotificationModule, NotificationType } from '@/src/shared/notifications/types';

export function useOpenNotificationCount(filter: { module?: NotificationModule; types?: NotificationType[] }): number {
  const { notifications } = useNotifications();
  const key = `${filter.module ?? ''}|${(filter.types ?? []).join(',')}`;
  return useMemo(() => {
    const now = new Date();
    return notifications.filter((n) => inView(n, 'inbox', now) && (!filter.module || n.module === filter.module) && (!filter.types || filter.types.includes(n.type))).length;
    // `key` stands for the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, key]);
}

export function NotificationsLink({ module, types, about = 'this page' }: { module?: NotificationModule; types?: NotificationType[]; about?: string }) {
  const count = useOpenNotificationCount({ module, types });
  if (!count) return null;
  return (
    <>
      {' '}
      <Link href="/notifications">
        {count} {count === 1 ? 'update' : 'updates'} about {about} in Notifications
      </Link>
      .
    </>
  );
}
