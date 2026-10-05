'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChartNoAxesCombined, ListOrdered, Menu, Plus, FolderPlus, ListPlus, HandCoins, CalendarPlus } from 'lucide-react';
import { query, where } from 'firebase/firestore';
import { navMode } from '@/src/shared/config/chromeVisibility';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { Modal } from '@/src/widgets/Modal/Modal';
import { MoreSheet } from '@/src/widgets/AppShell/MoreSheet';
import type { FirestoreBucket } from '@/src/shared/firestore/types';
import styles from './BucketsBottomNav.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

// Exported for WebSidebar (src/widgets/WebSidebar) — reused verbatim so
// mobile and web can never drift apart on what Buckets mode contains.
export const NAV_ITEMS = [
  { href: '/baskets', label: 'Home', icon: Home },
  // Money Insights replaced the old Buckets analytics page.
  { href: '/statistics', label: 'Insights', icon: ChartNoAxesCombined },
  { href: '/baskets/items', label: 'Priorities', icon: ListOrdered },
];

type Create = 'item' | 'income' | 'payment';

// Buckets mode's own bottom nav — BottomNav (Money) and ProjectsBottomNav
// (Projects) are its siblings, each rendered only on its own mode's hub
// routes (chromeVisibility.ts's navMode). The "+" opens what can be added:
// a bucket, or an item, an income source or a planned payment in one.
export function BucketsBottomNav() {
  const formLink = useFormLink();
  const pathname = usePathname();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<Create | null>(null);
  const [more, setMore] = useState(false);
  const shown = navMode(pathname) === 'buckets';
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(
    useMemo(() => (uid && shown ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid, shown])
  );

  if (!shown) return null;

  // Which buckets each kind of item can go into.
  const choices = (kind: Create) =>
    buckets
      .filter((b) => (kind === 'income' ? b.type === 'Income' : kind === 'payment' ? b.kind === 'Fixed' && b.type !== 'Income' : b.type !== 'Income'))
      .sort((a, b) => a.name.localeCompare(b.name));
  const close = () => {
    setOpen(false);
    setPicking(null);
  };

  return (
    <nav className={styles.bar} aria-label="Primary">
      <div className={styles.pill}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={2} />
              <span className={styles.srLabel}>{label}</span>
            </Link>
          );
        })}
        <button type="button" className={`${styles.item} ${styles.itemButton}`} aria-label="More" aria-haspopup="dialog" onClick={() => setMore(true)}>
          <Menu size={20} strokeWidth={2} />
        </button>
      </div>
      {more && <MoreSheet onClose={() => setMore(false)} />}
      <button type="button" className={styles.addButton} aria-label="Add" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Plus size={24} strokeWidth={2.25} />
      </button>

      {open && (
        // The bar lets taps through to the page; the sheet takes them back.
        <div className={styles.sheetLayer}>
        <Modal
          title={picking === 'item' ? 'Add an item to…' : picking === 'income' ? 'Add income to…' : picking === 'payment' ? 'Plan a payment in…' : 'Add'}
          onClose={close}
        >
          <div className={styles.sheet}>
            {!picking ? (
              <>
                <Link href={formLink('basket')} className={styles.sheetOption} onClick={close}>
                  <FolderPlus size={18} strokeWidth={2} aria-hidden /> New basket
                </Link>
                <button type="button" className={styles.sheetOption} onClick={() => setPicking('item')}>
                  <ListPlus size={18} strokeWidth={2} aria-hidden /> New item
                </button>
                <button type="button" className={styles.sheetOption} onClick={() => setPicking('income')}>
                  <HandCoins size={18} strokeWidth={2} aria-hidden /> New income source
                </button>
                <button type="button" className={styles.sheetOption} onClick={() => setPicking('payment')}>
                  <CalendarPlus size={18} strokeWidth={2} aria-hidden /> Plan a payment
                </button>
              </>
            ) : (
              <>
                {choices(picking).map((b) => (
                  <Link key={b.id} href={formLink('basket-item', { basket: b.id })} className={styles.sheetOption} onClick={close}>
                    {b.name}
                  </Link>
                ))}
                {choices(picking).length === 0 && (
                  <p className={styles.sheetEmpty}>
                    {picking === 'income' ? 'No income basket yet.' : picking === 'payment' ? 'No recurring basket yet.' : 'No basket yet.'}
                  </p>
                )}
                <Link href={formLink('basket')} className={styles.sheetOption} onClick={close}>
                  <FolderPlus size={18} strokeWidth={2} aria-hidden /> New {picking === 'income' ? 'income ' : ''}basket
                </Link>
              </>
            )}
          </div>
        </Modal>
        </div>
      )}
    </nav>
  );
}
