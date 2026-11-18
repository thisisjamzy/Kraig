'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { GreetingButton, GreetingHeader } from '@/src/phone/widgets/GreetingHeader/GreetingHeader';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { hasAppHeader, navMode } from '@/src/shared/config/chromeVisibility';
import { useCurrentAppBarAction } from '@/src/shared/appBar/appBarAction';
import styles from '@/src/phone/widgets/AppHeader/AppHeader.module.css';

// Shared top toolbar for every hub route in both modes — rendered once at
// the layout level, fixed in place like the bottom nav, so it never scrolls
// with the page content. Hidden on drill-down/detail routes, which use
// their own back-arrow header instead.
//
// The Money/Time mode switch that used to live here (ModeSwitch) is gone —
// switching modes is now the bottom nav's own FAB (BottomNav/
// ProjectsBottomNav), plus the existing swipe gesture
// (useSwipeModeSwitch) both hub screens already support.
export function AppHeader() {
  const pathname = usePathname();
  // A page's own action (Planning's per-tab one), shown before the bell.
  const action = useCurrentAppBarAction();
  const [hidden, setHidden] = useAmountsHidden();

  if (!hasAppHeader(pathname)) {
    return null;
  }

  const isMoney = navMode(pathname) === 'money';
  return (
    <header className={styles.header}>
      <GreetingHeader
        module={isMoney ? 'money' : 'time'}
        back={isMoney ? '/home' : '/projects/insights'}
        actions={
          <>
            {action &&
              (action.href ? (
                <Link href={action.href} className={styles.iconButton} aria-label={action.label} title={action.label}>
                  <action.icon size={18} strokeWidth={1.75} />
                </Link>
              ) : (
                <button type="button" className={styles.iconButton} onClick={action.onClick} aria-label={action.label} title={action.label}>
                  <action.icon size={18} strokeWidth={1.75} />
                </button>
              ))}
            {isMoney && (
              <GreetingButton label={hidden ? 'Show amounts' : 'Hide amounts'} pressed={hidden} onClick={() => setHidden(!hidden)}>
                {hidden ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
              </GreetingButton>
            )}
          </>
        }
      />
    </header>
  );
}
