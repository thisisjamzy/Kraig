'use client';

import { usePathname, useRouter } from 'next/navigation';
import { User, Settings, Calendar, Bell } from 'lucide-react';
import { hasAppHeader, navMode } from '@/src/shared/config/chromeVisibility';
import { ModeSwitch } from '@/src/widgets/ModeSwitch/ModeSwitch';
import { Logo } from '@/src/widgets/Logo/Logo';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import styles from './AppHeader.module.css';

// Shared top toolbar for every hub route in both modes — rendered once at
// the layout level, fixed in place like the bottom nav, so it never scrolls
// with the page content. Hidden on drill-down/detail routes, which use
// their own back-arrow header instead. The Money/Time switch lives here,
// centered between the logo and the profile button (not in either hub
// screen's own body), so it's always reachable without costing either
// screen its own vertical space. The profile icon is a context menu
// (Settings/Calendar/Notifications), not a direct link, since Calendar and
// Notifications need a way in that isn't tied to being inside Time mode.
export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = navMode(pathname);

  if (!hasAppHeader(pathname)) {
    return null;
  }

  return (
    <header className={styles.header}>
      <Logo className={styles.logo} />
      <ModeSwitch active={mode === 'projects' ? 'projects' : 'money'} />
      <ActionMenu
        title="Menu"
        ariaLabel="Menu"
        triggerIcon={<User size={18} strokeWidth={1.75} />}
        triggerClassName={styles.profileButton}
        items={[
          {
            key: 'settings',
            label: 'Settings',
            icon: <Settings size={16} strokeWidth={1.75} />,
            onSelect: () => router.push('/settings'),
          },
          {
            key: 'calendar',
            label: 'Calendar',
            icon: <Calendar size={16} strokeWidth={1.75} />,
            onSelect: () => router.push('/projects/calendar'),
          },
          {
            key: 'notifications',
            label: 'Notifications',
            icon: <Bell size={16} strokeWidth={1.75} />,
            onSelect: () => router.push('/notifications'),
          },
        ]}
      />
    </header>
  );
}
