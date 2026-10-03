'use client';

// The page's own actions at the top of a "..." menu (the top bar's, or the
// phone header's), then a divider.

import Link from 'next/link';
import { usePageMenuItems } from './breadcrumb';
import menu from './Sidebar.module.css';

export function PageMenuRows({ onDone }: { onDone: () => void }) {
  const items = usePageMenuItems();
  if (!items.length) return null;
  return (
    <>
      {items.map((item) =>
        item.href ? (
          <Link key={item.label} href={item.href} className={menu.menuRow} data-row onClick={onDone}>
            {item.label}
          </Link>
        ) : (
          <button
            key={item.label}
            type="button"
            className={menu.menuRow}
            data-row
            data-danger={item.danger || undefined}
            onClick={() => {
              onDone();
              item.onSelect?.();
            }}
          >
            {item.label}
          </button>
        )
      )}
      <hr className={menu.menuDivider} />
    </>
  );
}
