'use client';

// Time's phone bottom bar: Home, Scheduling, Calendar and Tasks (Today left
// the bar, owner 18 Nov 2026), and the lime
// button that switches to Money (the same bar as Money's: TabBar). Profile
// is in the screen header beside the bell (TimeHeader), at the owner's
// request (18 Nov 2026).

import { usePathname } from 'next/navigation';
import { CalendarDays, Check, House, Link2, Wallet } from 'lucide-react';
import { timeTab } from '@/src/shared/config/chromeVisibility';
import { TabBar, type Tab } from '@/src/phone/widgets/TabBar/TabBar';

const TABS: Tab[] = [
  { id: 'home', href: '/projects/insights', label: 'Home', icon: House },
  { id: 'scheduling', href: '/projects/calendar/links', label: 'Scheduling', icon: Link2 },
  { id: 'calendar', href: '/projects/calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tasks', href: '/tasks', label: 'Tasks', icon: Check },
];

export function ProjectsBottomNav() {
  const pathname = usePathname();
  const tab = timeTab(pathname);
  if (!tab) return null;
  return <TabBar label="Time" tabs={TABS} active={tab} fab={{ href: '/home', label: 'Switch to Money', icon: Wallet }} />;
}
