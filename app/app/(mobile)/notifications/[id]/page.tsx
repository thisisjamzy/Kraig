import type { Metadata } from 'next';
import { NotificationDetailRoute } from '@/src/routes/Notifications/NotificationDetailRoute';

export const metadata: Metadata = {
  title: 'Notification · Dreda',
};

export default async function NotificationPage({ params }: PageProps<'/notifications/[id]'>) {
  const { id } = await params;
  return <NotificationDetailRoute id={decodeURIComponent(id)} />;
}
