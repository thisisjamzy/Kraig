'use client';

// The page standard every rebuilt page follows, at every size:
//   - the title once, in the body (28px on phones, 32px on medium, 40px
//     from expanded up), an optional icon beside it and a muted kind;
//   - the page's primary actions on the right of the title (never a
//     floating bottom bar on wide screens);
//   - the properties block, then content blocks (callouts, databases,
//     chart blocks) at the content area's width.
// On wide screens the top bar's breadcrumb navigates (no back arrow). On a
// phone, a page that isn't a hub gets a compact header with its parent as
// "‹ Buckets" (up, never history back into an editor), notifications and
// "...".

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronLeft, Lightbulb, MoreHorizontal } from 'lucide-react';
import { hasAppHeader } from '@/src/shared/config/chromeVisibility';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useBreadcrumb, type Crumb } from '@/src/widgets/AppShell/breadcrumb';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { showToast } from '@/src/widgets/Toast/Toast';
import { PropertiesBlock, type Property } from './PropertiesBlock';
import styles from './Database.module.css';
import frame from './NotionPage.module.css';

export function NotionPageHeader({
  icon,
  title,
  kind,
  actions,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** "Expense bucket" */
  kind?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageTitleRow}>
        <div className={styles.pageTitleWrap}>
          {icon && <span className={styles.pageIcon}>{icon}</span>}
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {kind && <p className={styles.pageKind}>{kind}</p>}
          </div>
        </div>
        {actions && <div className={styles.pageActions}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A titled content block (Items, Transactions, Notes). */
export function Block({ title, actions, children, id }: { title?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={styles.block} id={id} aria-label={title}>
      {(title || actions) && (
        <div className={styles.blockHead}>
          {title && <h2 className={styles.blockTitle}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** A summary callout: an icon and one or two sentences. */
export function Callout({ icon, tone, children }: { icon?: ReactNode; tone?: 'bad' | 'good' | 'watch'; children: ReactNode }) {
  return (
    <aside className={styles.callout} data-tone={tone}>
      <span className={styles.calloutIcon} aria-hidden>
        {icon ?? <Lightbulb size={18} strokeWidth={2} />}
      </span>
      <div className={styles.calloutBody}>{children}</div>
    </aside>
  );
}

/** The phone header for pages that aren't hubs: "‹ Parent", notifications, "...". */
function CompactHeader({ parent }: { parent: Crumb | null }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  return (
    <header className={frame.compactHeader}>
      {parent?.href ? (
        <Link href={parent.href} className={frame.up}>
          <ChevronLeft size={20} strokeWidth={2.25} aria-hidden />
          {parent.label}
        </Link>
      ) : (
        <span />
      )}
      <span className={frame.compactActions}>
        <Link href="/notifications" className={frame.compactIcon} aria-label="Notifications">
          <Bell size={20} strokeWidth={1.9} />
        </Link>
        <button type="button" className={frame.compactIcon} aria-label="Page options" onClick={(e) => setMenu(e.currentTarget)}>
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
      </span>
      {menu && (
        <Popover anchor={menu} label="Page options" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).then(() => showToast('Link copied'));
                setMenu(null);
              }}
            >
              Copy link
            </button>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                setMenu(null);
                window.setTimeout(() => window.print(), 50);
              }}
            >
              Export as PDF
            </button>
          </div>
        </Popover>
      )}
    </header>
  );
}

export function NotionPage({
  title,
  icon,
  kind,
  crumbs,
  properties,
  actions,
  children,
}: {
  title: string;
  icon?: ReactNode;
  kind?: string;
  /** The breadcrumb; its last entry is this page, the one before is "up". */
  crumbs: Crumb[];
  properties?: Property[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const wide = useHasTopBar();
  const pathname = usePathname();
  useBreadcrumb(crumbs);
  const parent = [...crumbs.slice(0, -1)].reverse().find((c) => c.href) ?? null;
  const showCompactHeader = !wide && !hasAppHeader(pathname);
  return (
    <div className={frame.page} data-wide={wide || undefined}>
      {showCompactHeader && <CompactHeader parent={parent} />}
      <NotionPageHeader icon={icon} title={title} kind={kind} actions={actions}>
        {properties && properties.length > 0 && <PropertiesBlock properties={properties} />}
      </NotionPageHeader>
      {children}
    </div>
  );
}
