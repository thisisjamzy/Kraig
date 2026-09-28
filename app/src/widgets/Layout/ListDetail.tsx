'use client';

// Template C, list and detail (medium screens and up): the list on the
// left, the selected item's details on the right. The selection lives in
// the URL (?<param>=<id>), so links and Back work; with nothing selected
// the detail side shows `empty` (a small summary).

import { useCallback, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './ListDetail.module.css';

export function useUrlSelection(param: string): [string | null, (id: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const current = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(param);
  const select = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(window.location.search);
      if (id) sp.set(param, id);
      else sp.delete(param);
      const s = sp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [router, pathname, param]
  );
  return [current, select];
}

export function ListDetail({
  list,
  detail,
  empty,
  listWidth = 420,
  listLabel,
  detailLabel,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  empty: ReactNode;
  listWidth?: number;
  listLabel: string;
  detailLabel: string;
}) {
  return (
    <div className={styles.wrap} style={{ gridTemplateColumns: `${listWidth}px minmax(0, 1fr)` }}>
      <section className={styles.list} aria-label={listLabel}>
        {list}
      </section>
      <section className={styles.detail} aria-label={detailLabel}>
        {detail ?? empty}
      </section>
    </div>
  );
}
