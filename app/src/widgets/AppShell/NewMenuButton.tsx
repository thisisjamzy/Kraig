'use client';

// One "New" button in the top bar's main-action spot, with a menu of what
// can be made from the page (Work: New task, New project, New area). Each
// entry opens the same form its old button did.

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import bar from './TopBar.module.css';
import menu from './Sidebar.module.css';

export interface NewMenuItem {
  label: string;
  href: string;
  icon: ReactNode;
}

export function NewMenuButton({ items, label = 'New' }: { items: NewMenuItem[]; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" className={bar.primary} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        {label}
        <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
      </button>
      {anchor && (
        <Popover anchor={anchor} label={`${label} menu`} onClose={() => setAnchor(null)}>
          <div className={menu.menu} role="menu">
            {items.map((item) => (
              <Link key={item.label} href={item.href} scroll={false} role="menuitem" className={menu.menuRow} data-row onClick={() => setAnchor(null)}>
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
