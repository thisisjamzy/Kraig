import type { ReactNode } from 'react';
import { AppHeader } from '@/src/widgets/AppHeader/AppHeader';
import { AppContent } from '@/src/widgets/AppContent/AppContent';
import { BottomNav } from '@/src/widgets/BottomNav/BottomNav';
import { ProjectsBottomNav } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { PinGuard } from '@/src/widgets/PinGuard/PinGuard';
import styles from './layout.module.css';

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <PinGuard>
        <AppHeader />
        <AppContent>{children}</AppContent>
        <BottomNav />
        <ProjectsBottomNav />
      </PinGuard>
    </div>
  );
}
