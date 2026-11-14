'use client';

// The header for medium screens and up, drawn from Dreda.figcraft
// `Top bar` (Dashboard / Web, Transactions / Web): one row, no border.
// Left: "»" when the sidebar is collapsed, then the page's title (36px
// Bricolage) and subtitle. Pages hand theirs in with <TopBarTitle>; any
// other page shows its route's name. Right, as 44px pills: Search ⌘K, the
// page's own controls (<TopBarControls>, e.g. the month picker), the bell,
// the page's own buttons (<TopBarActions>, e.g. New folder) and the
// module's main action (Add transaction or New task). Always one row: the
// title gives way (ellipsis) before anything wraps. "..." shows
// only when the page has options of its own (export, page actions).

import { useState } from 'react';
import Link from 'next/link';
import { ChevronsRight, Eye, EyeOff, MoreHorizontal, Printer, Search } from 'lucide-react';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { usePageExport, usePageMenuItems, usePageMeta } from './breadcrumb';
import { PageMenuRows } from './PageMenuRows';
import menu from './Sidebar.module.css';
import styles from './TopBar.module.css';
import { NotificationsMenu } from '@/src/widgets/Notifications/NotificationsMenu';
import { useWebOnly } from '@/src/shared/device/useWebOnly';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { isMac, useAppMode } from './Sidebar';

export function TopBar({
  showExpand,
  onExpand,
  onSearch,
  fallbackTitle,
  setTitleSlot,
  setControlsSlot,
  setActionsSlot,
  setPrimarySlot,
}: {
  showExpand: boolean;
  onExpand: () => void;
  onSearch: () => void;
  /** The route's name, for pages that don't hand in a title. */
  fallbackTitle: string;
  setTitleSlot: (el: HTMLDivElement | null) => void;
  setControlsSlot: (el: HTMLDivElement | null) => void;
  setActionsSlot: (el: HTMLDivElement | null) => void;
  setPrimarySlot: (el: HTMLDivElement | null) => void;
}) {
  useWebOnly('TopBar');
  const meta = usePageMeta();
  const mode = useAppMode();
  const formLink = useFormLink();
  const taskPanel = useTaskPanel();
  const pageExport = usePageExport();
  const pageItems = usePageMenuItems();
  const [options, setOptions] = useState<HTMLElement | null>(null);
  const [hidden, setHidden] = useAmountsHidden();
  const hasOptions = pageExport || pageItems.length > 0;

  const action = mode === 'money' ? { href: formLink('transaction'), label: 'Add transaction' } : { href: taskPanel.hrefFor('new'), label: 'New task' };

  return (
    <header className={styles.bar}>
      {showExpand && (
        <button type="button" className={styles.pill} data-icon onClick={onExpand} aria-label="Open sidebar" title="Open sidebar (Ctrl or Cmd + \)">
          <ChevronsRight size={20} strokeWidth={2} />
        </button>
      )}

      <div className={styles.heading}>
        <div ref={setTitleSlot} className={styles.titleSlot} />
        {!meta.titled && <h1 className={styles.title}>{fallbackTitle}</h1>}
      </div>

      <button type="button" className={`${styles.pill} ${styles.search}`} onClick={onSearch}>
        <Search size={18} strokeWidth={2} aria-hidden className={styles.glyph} />
        <span className={styles.searchText}>Search</span>
        <kbd className={styles.kbd}>{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <div ref={setControlsSlot} className={styles.controls} />

      {mode === 'money' && (
        <button
          type="button"
          className={styles.pill}
          data-icon
          aria-pressed={hidden}
          aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          title={hidden ? 'Show amounts' : 'Hide amounts'}
          onClick={() => setHidden(!hidden)}
        >
          {hidden ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
        </button>
      )}

      <NotificationsMenu className={`${styles.pill} ${styles.bell}`} size={20} />

      <div ref={setActionsSlot} className={styles.controls} />

      {/* A page's own main action (<TopBarPrimary>) hides the module's. */}
      <div ref={setPrimarySlot} className={styles.primarySlot} />
      <Link href={action.href} scroll={false} className={styles.primary}>
        {action.label}
      </Link>

      {hasOptions && (
        <button type="button" className={styles.pill} data-icon aria-label="Page options" title="Page options" onClick={(e) => setOptions(e.currentTarget)}>
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
      )}

      {options && (
        <Popover anchor={options} label="Page options" onClose={() => setOptions(null)}>
          <div className={menu.menu}>
            <PageMenuRows onDone={() => setOptions(null)} />
            {pageExport && (
              <button
                type="button"
                className={menu.menuRow}
                data-row
                onClick={() => {
                  setOptions(null);
                  window.setTimeout(() => window.print(), 50);
                }}
              >
                <Printer size={15} strokeWidth={2} aria-hidden /> Export as PDF
              </button>
            )}
          </div>
        </Popover>
      )}
    </header>
  );
}
