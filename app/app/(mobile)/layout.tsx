import type { ReactNode } from 'react';
import { AppHeader } from '@/src/widgets/AppHeader/AppHeader';
import { AppContent } from '@/src/widgets/AppContent/AppContent';
import { BottomNav } from '@/src/widgets/BottomNav/BottomNav';
import { ProjectsBottomNav } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { AuthGuard } from '@/src/widgets/AuthGuard/AuthGuard';
import styles from './layout.module.css';

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AuthGuard>
        <AppHeader />
        <AppContent>{children}</AppContent>
        <BottomNav />
        <ProjectsBottomNav />
      </AuthGuard>
    </div>
  );
}
