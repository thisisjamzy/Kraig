'use client';

// A notification's own address (/notifications/<id>): its full-screen page
// on a phone; from 768px up, the Notifications page with it open in the
// side peek.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DeviceSplit } from '@/src/shared/device/DeviceSplit';
import { NotificationDetailScreen } from '@/src/phone/screens/NotificationDetail/NotificationDetailScreen';

function OpenInInbox({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/notifications?open=${encodeURIComponent(id)}`);
  }, [id, router]);
  return null;
}

export function NotificationDetailRoute({ id }: { id: string }) {
  return <DeviceSplit phone={<NotificationDetailScreen id={id} />} web={<OpenInInbox id={id} />} />;
}
