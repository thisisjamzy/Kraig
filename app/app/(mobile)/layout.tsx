'use client';

import type { ReactNode } from 'react';
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
export default function AppShellLayout({ children }: { children: ReactNode }) {
  const isWeb = useIsWeb();

  return (
    <div className={isWeb ? styles.webShell : styles.shell}>
      <AuthGuard>
        {isWeb ? (
          <>
            <WebSidebar />
            <div className={styles.webMain}>
              <WebTopBar />
              <div className={styles.webContentCenterer}>
                <AppContent>{children}</AppContent>
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
