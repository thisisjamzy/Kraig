'use client';

import { usePathname } from 'next/navigation';
import { CalendarDays, Clock, Home, PieChart, SlidersHorizontal } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { TabBar } from '@/src/phone/widgets/TabBar/TabBar';

// Buckets dropped from here — reachable from Home's own Quick Actions instead
// (src/screens/Home/HomeScreen.tsx) — /baskets stays a MONEY_HUB_ROUTE
// (chromeVisibility.ts) so this bar still shows there, just with no tab of
// its own highlighted, same as /debts already works.
// Exported for WebSidebar (src/widgets/WebSidebar) — the web shell's nav
// rail reuses this exact list rather than re-declaring Money mode's routes,
// so mobile and web can never drift apart on what Money mode contains.
export const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/statistics', label: 'Insights', icon: PieChart },
  { href: '/budget', label: 'Budget', icon: SlidersHorizontal },
  { href: '/payments', label: 'Payments', icon: CalendarDays },
];

// Money mode's own bottom nav — ProjectsBottomNav is Projects mode's
// equivalent, rendered instead of this one on that mode's own hub routes
// (see chromeVisibility.ts's navMode).
//
// The same bar as Time's (TabBar, owner 18 Nov 2026): the tabs and the lime
// mode button beside them, whose icon is the mode it jumps TO. No Add
// circle (owner, 23 Nov 2026): Add transaction lives on Home and
// Transactions.
export function BottomNav() {
  const pathname = usePathname();
  if (navMode(pathname) !== 'money') return null;
  const active = NAV_ITEMS.find(({ href }) => pathname === href || pathname?.startsWith(`${href}/`))?.href ?? null;
  return (
    <TabBar
      label="Money"
      tabs={NAV_ITEMS.map((n) => ({ id: n.href, href: n.href, label: n.label, icon: n.icon }))}
      active={active}
      fab={{ href: '/projects/insights', label: 'Switch to Time', icon: Clock }}
    />
  );
}
