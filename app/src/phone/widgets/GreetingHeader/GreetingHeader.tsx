'use client';

// The phone toolbar, the same on every Money and Time page (owner, 18 Nov
// 2026): your face (the local Notionist avatar) on the left, "Hello James"
// over today's date, then the page's own buttons and More (six dots) on the
// right. More (nine dots, no circle) opens Notifications (with the unread count), Archive,
// Library, Insights and Settings. Tapping the face opens Profile in Time
// and Settings in Money.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, Bell, ChartPie, ChevronLeft, FileText, Grip, Settings, type LucideIcon } from 'lucide-react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useUnreadCount } from '@/src/shared/hooks/useNotifications';
import { avatarSrc, PROFILE_AVATAR_ID } from '@/src/viewmodels/people';
import { ProfileSheet } from '@/src/phone/widgets/ProfileSheet/ProfileSheet';
import styles from '@/src/phone/widgets/GreetingHeader/GreetingHeader.module.css';

type Module = 'time' | 'money';

const MENU: Record<Module, { href: string; label: string; icon: LucideIcon }[]> = {
  time: [
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/library?tab=archive', label: 'Archive', icon: Archive },
    { href: '/library', label: 'Library', icon: FileText },
    { href: '/projects/analytics', label: 'Insights', icon: ChartPie },
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
  money: [
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/settings/archived-baskets', label: 'Archive', icon: Archive },
    { href: '/library', label: 'Library', icon: FileText },
    { href: '/statistics', label: 'Insights', icon: ChartPie },
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
};

/** `back`: every page but the two Homes has one, first on the left. It
 * goes where the app's back rule says (useGoBack), else to `back`. */
export function GreetingHeader({ module, actions, back }: { module: Module; actions?: ReactNode; back?: string }) {
  const goBack = useGoBack();
  const { user } = useFirebaseUser();
  const { unread } = useUnreadCount();
  const pathname = usePathname();
  const [profile, setProfile] = useState(false);
  const [menu, setMenu] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const box = useRef<HTMLDivElement>(null);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (menu) setMenu(false);
  }

  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const first = (user?.displayName ?? '').trim().split(/\s+/)[0];
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const face = (
    // eslint-disable-next-line @next/next/no-img-element -- local SVG asset, no optimisation to gain
    <img src={avatarSrc(PROFILE_AVATAR_ID)} alt="" width={44} height={44} />
  );

  return (
    <div className={styles.header}>
      {back && (
        <button type="button" className={styles.back} aria-label="Back" onClick={() => goBack(back)}>
          <ChevronLeft size={22} strokeWidth={2.25} />
        </button>
      )}
      {module === 'money' ? (
        <Link href="/settings" className={styles.avatar} aria-label="Profile and settings">
          {face}
        </Link>
      ) : (
        <button type="button" className={styles.avatar} aria-label="Profile" aria-haspopup="dialog" aria-expanded={profile} onClick={() => setProfile(true)}>
          {face}
        </button>
      )}
      <div className={styles.hello}>
        <span>{first ? `Hello ${first}` : 'Hello'}</span>
        <strong>{date}</strong>
      </div>
      {actions}
      <div className={styles.moreBox} ref={box}>
        <button type="button" className={styles.more} aria-label={unread ? `More, ${unread} unread notifications` : 'More'} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <Grip size={24} strokeWidth={2.25} />
          {unread > 0 && <span className={styles.badge} aria-hidden />}
        </button>
        {menu && (
          <div className={styles.menu} role="menu">
            {MENU[module].map(({ href, label, icon: Icon }) => (
              <Link key={label} href={href} role="menuitem" className={styles.menuRow} onClick={() => setMenu(false)}>
                <Icon size={18} strokeWidth={2} aria-hidden />
                <span>{label}</span>
                {label === 'Notifications' && unread > 0 && <span className={styles.count}>{unread > 99 ? '99+' : unread}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
      {profile && <ProfileSheet onClose={() => setProfile(false)} />}
    </div>
  );
}

/** A 44px round toolbar button, before More. */
export function GreetingButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.round} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
