'use client';

// The web shell's top bar — mounted alongside WebSidebar only when
// useViewportMode() isn't 'mobile'. Replaces AppHeader visually in web
// mode (AppHeader itself is untouched and keeps rendering as-is for
// mobile), reusing the exact same Notifications/Settings hrefs AppHeader
// already links to rather than re-deciding what belongs here. Sticky
// (position: sticky, see WebTopBar.module.css) so it stays visible while a
// tall dashboard page scrolls beneath it, and carries a "+" create button —
// desktop/tablet's own create entry point now that mobile's own bottom-nav
// FAB switches Money<->Time mode instead of creating anything (Money mode
// still links straight to /add-transaction; Projects mode opens the
// three-way sheet via ProjectsBottomNav's exported CREATE_OPTIONS).

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Plus, User } from 'lucide-react';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { Modal } from '@/src/widgets/Modal/Modal';
import { CREATE_OPTIONS } from '@/src/widgets/ProjectsBottomNav/ProjectsBottomNav';
import { iconTint } from '@/src/viewmodels/iconTint';
import styles from './WebTopBar.module.css';

const SECTION_TITLE: Record<string, string> = {
  money: 'Money',
  projects: 'Projects',
  goals: 'Goals',
};

export function WebTopBar() {
  const pathname = usePathname();
  const mode = navMode(pathname);
  const title = SECTION_TITLE[mode] ?? 'Dreda';
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <header className={styles.topBar}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.actions}>
        {mode === 'projects' ? (
          <button
            type="button"
            className={styles.addButton}
            aria-label="Create"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={18} strokeWidth={2.25} />
          </button>
        ) : (
          <Link href="/add-transaction" className={styles.addButton} aria-label="Add transaction">
            <Plus size={18} strokeWidth={2.25} />
          </Link>
        )}
        <Link href="/notifications" className={styles.iconButton} aria-label="Notifications">
          <Bell size={18} strokeWidth={1.75} />
        </Link>
        <Link href="/settings" className={styles.iconButton} aria-label="Settings">
          <User size={18} strokeWidth={1.75} />
        </Link>
      </div>

      {createOpen && (
        <Modal title="Create" onClose={() => setCreateOpen(false)}>
          <div className={styles.sheetList}>
            {CREATE_OPTIONS.map(({ href, label, icon: Icon }, index) => (
              <Link key={href} href={href} className={styles.sheetOption} onClick={() => setCreateOpen(false)}>
                <span className={styles.sheetOptionIcon} style={{ background: iconTint(index) }}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.sheetOptionLabel}>{label}</span>
              </Link>
            ))}
          </div>
        </Modal>
      )}
    </header>
  );
}
