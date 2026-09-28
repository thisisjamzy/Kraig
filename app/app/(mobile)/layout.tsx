'use client';

import { Suspense, type ReactNode } from 'react';
import { AppHeader } from '@/src/widgets/AppHeader/AppHeader';
import { AppContent } from '@/src/widgets/AppContent/AppContent';
import { BottomNav } from '@/src/widgets/BottomNav/BottomNav';
import { ProjectsBottomNav } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { BucketsBottomNav } from '@/src/widgets/BucketsBottomNav/BucketsBottomNav';
import { AuthGuard } from '@/src/widgets/AuthGuard/AuthGuard';
import { NavigationTracker } from '@/src/shared/navigation/NavigationTracker';
import { ToastHost } from '@/src/widgets/Toast/Toast';
import { ActualTimePrompt } from '@/src/widgets/ActualTimePrompt/ActualTimePrompt';
import { InsightsNotifier } from '@/src/shared/insights/InsightsNotifier';
import { CalendarSyncRunner } from '@/src/shared/calendarSync/CalendarSyncRunner';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { AppShell } from '@/src/widgets/AppShell/AppShell';
import { PanelHost } from '@/src/widgets/AppShell/PanelHost';
import styles from './layout.module.css';

// Two shells, chosen by device class (useLayout):
//   - compact (phones, under 768px): AppHeader, the bottom navs and the
//     floating button — exactly as the app has always been. useLayout()
//     reports 'compact' on the server and on first paint everywhere, and a
//     phone never matches the wider classes, so nothing in the other
//     branch can reach a phone.
//   - medium and up: AppShell — side drawer, top bar, page templates
//     (docs/ARCHITECTURE-RESPONSIVE.md).
// PanelHost sits outside both: on wide screens it shows the task side
// panel from the URL, on a phone it turns such a link into the full page.
export default function AppShellLayout({ children }: { children: ReactNode }) {
  const { isWide } = useLayout();

  return (
    <div className={isWide ? undefined : styles.shell}>
      <NavigationTracker />
      <ToastHost />
      <ActualTimePrompt />
      <InsightsNotifier />
      <CalendarSyncRunner />
      <AuthGuard>
        {isWide ? (
          <AppShell>{children}</AppShell>
        ) : (
          <>
            <AppHeader />
            <AppContent>{children}</AppContent>
            <BottomNav />
            <ProjectsBottomNav />
            <BucketsBottomNav />
          </>
        )}
        <Suspense fallback={null}>
          <PanelHost />
        </Suspense>
      </AuthGuard>
    </div>
  );
}
