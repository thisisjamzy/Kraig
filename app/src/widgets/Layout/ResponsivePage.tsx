'use client';

// A page that exists on both phone and wide screens with one header each:
// on a phone, the usual screen header with a back arrow and the title; on
// medium screens and up, no in-page header at all — the top bar's
// breadcrumb handles navigation — and a Notion-style title instead.

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useBreadcrumb, type Crumb } from '@/src/widgets/AppShell/breadcrumb';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import styles from './ResponsivePage.module.css';

export function ResponsivePage({
  title,
  kind,
  icon,
  crumbs,
  back,
  actions,
  children,
}: {
  title: string;
  kind?: string;
  icon?: ReactNode;
  /** Wide screens: the breadcrumb (the last one is this page). */
  crumbs: Crumb[];
  /** Phone: where back goes when there's no history. */
  back: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const wide = useHasTopBar();
  const goBack = useGoBack();
  useBreadcrumb(wide ? crumbs : null);
  return (
    <div className={styles.page} data-wide={wide || undefined}>
      {wide ? (
        <NotionPageHeader icon={icon} title={title} kind={kind} actions={actions} />
      ) : (
        <>
          <ScreenHeader
            left={
              <button type="button" className={styles.back} onClick={() => goBack(back)} aria-label="Back">
                <ArrowLeft size={20} strokeWidth={2} />
              </button>
            }
            title={title}
          />
          {actions && <div className={styles.phoneActions}>{actions}</div>}
        </>
      )}
      {children}
    </div>
  );
}
