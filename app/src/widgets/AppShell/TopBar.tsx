'use client';

// The top bar for medium screens and up, in Notion's style: 44px, white,
// a 1px bottom border. Left: "»" when the sidebar is collapsed, then the
// page's breadcrumb with small icons, every part a link (on medium, the
// middle parts fold into "..." when there are more than three). Right,
// small and quiet: the sync status, notifications, a star to add the page
// to Favorites, and "..." for page options (full or standard width, export,
// copy link, page info). No search field, title, back arrow or buttons.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronsRight, Copy, FileText, Info, MoreHorizontal, Printer, Star, StretchHorizontal } from 'lucide-react';
import { defaultCrumbs, PAGE_TREE, pageForPath } from '@/src/shared/config/pageTree';
import { useFavorites } from '@/src/shared/hooks/useFavorites';
import { useSyncStatus } from '@/src/shared/hooks/useSyncStatus';
import { useLocationSearch } from '@/src/shared/navigation/locationSearch';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { showToast } from '@/src/widgets/Toast/Toast';
import { setPageWidth, usePageMeta, usePageWidth, type Crumb } from './breadcrumb';
import { PageMenuRows } from './PageMenuRows';
import menu from './Sidebar.module.css';
import styles from './TopBar.module.css';

function iconFor(crumb: Crumb, index: number) {
  if (index === 0) return null;
  const page = crumb.href ? [...PAGE_TREE.money, ...PAGE_TREE.time].find((p) => p.href === crumb.href) : null;
  return page?.icon ?? FileText;
}

export function TopBar({
  showExpand,
  onExpand,
  compactCrumbs,
  defaultWidth,
}: {
  showExpand: boolean;
  onExpand: () => void;
  /** Medium: fold the middle of a long breadcrumb into "...". */
  compactCrumbs: boolean;
  defaultWidth: 'full' | 'standard';
}) {
  const pathname = usePathname();
  const search = useLocationSearch(pathname);
  const meta = usePageMeta();
  const sync = useSyncStatus();
  const favorites = useFavorites();
  const width = usePageWidth(pathname, defaultWidth);
  const [options, setOptions] = useState<HTMLElement | null>(null);
  const [info, setInfo] = useState(false);

  const crumbs = meta.crumbs ?? defaultCrumbs(pathname, search);
  const here = `${pathname ?? ''}${search}`;
  const title = crumbs[crumbs.length - 1]?.label ?? 'Page';
  const starred = favorites.isFavorite(here);
  const shown: (Crumb | 'fold')[] = compactCrumbs && crumbs.length > 3 ? [crumbs[0], 'fold', crumbs[crumbs.length - 1]] : crumbs;

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        {showExpand && (
          <button type="button" className={styles.iconButton} onClick={onExpand} aria-label="Open sidebar" title="Open sidebar (Ctrl or Cmd + \)">
            <ChevronsRight size={18} strokeWidth={2} />
          </button>
        )}
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <ol>
            {shown.map((crumb, index) => {
              if (crumb === 'fold') {
                const hidden = crumbs.slice(1, -1);
                return (
                  <li key="fold">
                    <span className={styles.sep}>/</span>
                    <span className={styles.crumbText} title={hidden.map((c) => c.label).join(' / ')}>
                      ...
                    </span>
                  </li>
                );
              }
              const last = index === shown.length - 1;
              const Icon = iconFor(crumb, crumbs.indexOf(crumb));
              const body = (
                <>
                  {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
                  <span>{crumb.label}</span>
                </>
              );
              return (
                <li key={`${crumb.label}-${index}`}>
                  {index > 0 && <span className={styles.sep}>/</span>}
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className={styles.crumbLink}>
                      {body}
                    </Link>
                  ) : (
                    <span className={styles.crumbText} aria-current={last ? 'page' : undefined}>
                      {body}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className={styles.right}>
        <span className={styles.sync}>{sync}</span>
        <Link href="/notifications" className={styles.iconButton} aria-label="Notifications" title="Notifications">
          <Bell size={17} strokeWidth={1.9} />
        </Link>
        <button
          type="button"
          className={styles.iconButton}
          aria-pressed={starred}
          aria-label={starred ? 'Remove from Favorites' : 'Add to Favorites'}
          title={starred ? 'Remove from Favorites' : 'Add to Favorites'}
          onClick={() => void favorites.toggle({ href: here, label: title, kind: pageForPath(pathname, search)?.id ?? 'page' })}
        >
          <Star size={17} strokeWidth={1.9} fill={starred ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className={styles.iconButton} aria-label="Page options" title="Page options" onClick={(e) => setOptions(e.currentTarget)}>
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      </div>

      {options && (
        <Popover anchor={options} label="Page options" onClose={() => setOptions(null)}>
          <div className={menu.menu}>
            <PageMenuRows onDone={() => setOptions(null)} />
            <button
              type="button"
              className={menu.menuRow}
              data-row
              onClick={() => {
                if (pathname) setPageWidth(pathname, width === 'full' ? 'standard' : 'full');
                setOptions(null);
              }}
            >
              <StretchHorizontal size={15} strokeWidth={2} aria-hidden />
              {width === 'full' ? 'Standard width' : 'Full width'}
            </button>
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
            <button
              type="button"
              className={menu.menuRow}
              data-row
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).then(() => showToast('Link copied'));
                setOptions(null);
              }}
            >
              <Copy size={15} strokeWidth={2} aria-hidden /> Copy link
            </button>
            <button
              type="button"
              className={menu.menuRow}
              data-row
              onClick={() => {
                setInfo((i) => !i);
              }}
            >
              <Info size={15} strokeWidth={2} aria-hidden /> Page info
            </button>
            {info && (
              <p className={styles.info}>
                {title}
                <br />
                {here}
              </p>
            )}
          </div>
        </Popover>
      )}
    </header>
  );
}
