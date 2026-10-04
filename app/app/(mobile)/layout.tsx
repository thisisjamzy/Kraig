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
import { CalendarSyncRunner } from '@/src/shared/calendarSync/CalendarSyncRunner';
import { BudgetRunner } from '@/src/shared/budget/BudgetRunner';
import { useLayout } from '@/src/shared/hooks/useLayout';
import dynamic from 'next/dynamic';
import { PanelHost } from '@/src/widgets/AppShell/PanelHost';
import { NotificationsRunner } from '@/src/widgets/Notifications/NotificationsRunner';
import { NotificationPrompt } from '@/src/widgets/Notifications/NotificationPrompt';
import { PlanSnapshotWorker } from '@/src/widgets/Notifications/PlanSnapshotWorker';
import styles from './layout.module.css';

// Medium screens and up only — its own chunk, so phones never download the
// drawer, top bar or page templates.
const AppShell = dynamic(() => import('@/src/widgets/AppShell/AppShell').then((m) => m.AppShell), { ssr: false });

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
// The runners keep the budget, the plan snapshot and the notifications up
// to date; NotificationPrompt asks once a session about unread ones.
export default function AppShellLayout({ children }: { children: ReactNode }) {
  const { isWide } = useLayout();

  return (
    <div className={isWide ? undefined : styles.shell}>
      <NavigationTracker />
      <ToastHost />
      <ActualTimePrompt />
      <CalendarSyncRunner />
      <BudgetRunner />
      <NotificationsRunner />
      <PlanSnapshotWorker />
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
        <NotificationPrompt />
      </AuthGuard>
    </div>
  );
}
