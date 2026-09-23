'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { AppHeader } from '@/src/widgets/AppHeader/AppHeader';
import { AppContent } from '@/src/widgets/AppContent/AppContent';
import { BottomNav } from '@/src/widgets/BottomNav/BottomNav';
import { ProjectsBottomNav } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { GoalsBottomNav } from '@/src/widgets/GoalsBottomNav/GoalsBottomNav';
import { AuthGuard } from '@/src/widgets/AuthGuard/AuthGuard';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import { WebSidebar } from '@/src/widgets/WebSidebar/WebSidebar';
import { WebTopBar } from '@/src/widgets/WebTopBar/WebTopBar';
import styles from './layout.module.css';

// isWeb is 'mobile'-on-the-server/first-paint always (useViewportMode's
// own guarantee) — a phone visitor never mounts WebSidebar/WebTopBar at
// all, and every existing mobile widget/CSS file below is completely
// untouched by this branch, so this can only ever ADD a presentation, never
// change the one that already shipped.
//
// Routes with an actual, purpose-built web design today — every other
// route would otherwise just inherit its mobile layout stretched into the
// web shell, which reads poorly at desktop width (per explicit feedback
// that every web page designed so far reads poorly). Rather than ship
// that, a web visitor to an undesigned route sees a plain "not designed
// yet" notice instead — mobile is completely unaffected either way.
// address-book/resources/projects' own control-panel are already their own
// minimal ComingSoonScreen, so they're "web-ready" as-is rather than
// getting a second blank wrapper on top. Grow this list as each route
// gets its own real web design.
const WEB_READY_ROUTES = ['/home', '/address-book', '/resources', '/projects/control-panel'];

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const isWeb = useIsWeb();
  const pathname = usePathname();
  const isWebReady = WEB_READY_ROUTES.includes(pathname ?? '');

  return (
    <div className={isWeb ? styles.webShell : styles.shell}>
      <AuthGuard>
        {isWeb ? (
          <>
            <WebSidebar />
            <div className={styles.webMain}>
              <WebTopBar />
              <div className={styles.webContentCenterer}>
                {isWebReady ? (
                  <AppContent>{children}</AppContent>
                ) : (
                  <div className={styles.webBlank}>
                    <LayoutGrid size={28} strokeWidth={1.5} />
                    <p className={styles.webBlankText}>This page hasn&apos;t been designed for web yet.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <AppHeader />
            <AppContent>{children}</AppContent>
            <BottomNav />
            <ProjectsBottomNav />
            <GoalsBottomNav />
          </>
        )}
      </AuthGuard>
    </div>
  );
}
