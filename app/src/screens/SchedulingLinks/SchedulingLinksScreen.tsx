'use client';

// Scheduling links on tablet and web: the Notion-style title with Back to
// calendar, over the shared body (src/widgets/SchedulingLinks).

import Link from 'next/link';
import { ResponsivePage } from '@/src/widgets/Layout/ResponsivePage';
import { SchedulingLinksBody, schedulingLinksStyles as styles } from '@/src/widgets/SchedulingLinks/SchedulingLinksBody';

export function SchedulingLinksScreen() {
  return (
    <ResponsivePage
      title="Scheduling links"
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Calendar', href: '/projects/calendar' }, { label: 'Scheduling links' }]}
      back="/projects/calendar"
      actions={
        <Link href="/projects/calendar" className={styles.secondary}>
          Back to calendar
        </Link>
      }
    >
      <SchedulingLinksBody />
    </ResponsivePage>
  );
}
