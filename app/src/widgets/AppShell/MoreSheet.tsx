'use client';

// Phones: the "More" sheet from the bottom nav. Full height, and holds what
// the sidebar holds on wider screens: the workspace switcher, Search,
// Favorites, the module's page tree and Settings.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Search, Settings, X } from 'lucide-react';
import { MODE_HOME, MODE_LABEL, type AppMode } from '@/src/shared/config/pageTree';
import logomark from '@/public/logos/black_logomark.png';
import { FavoritesSection, PageTree } from './PageTree';
import { SearchPalette } from './SearchPalette';
import { useAppMode } from './Sidebar';
import styles from './MoreSheet.module.css';

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const mode = useAppMode();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (searching) return <SearchPalette onClose={onClose} />;

  return (
    <div className={styles.layer} role="dialog" aria-modal="true" aria-label="More">
      <header className={styles.head}>
        <h2>More</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <X size={20} strokeWidth={2} />
        </button>
      </header>
      <div className={styles.body}>
        <div className={styles.switcher} role="group" aria-label="Workspace">
          {(['money', 'time'] as AppMode[]).map((m) => (
            <Link key={m} href={MODE_HOME[m]} className={styles.mode} aria-current={m === mode ? 'true' : undefined} onClick={onClose}>
              <Image src={logomark} alt="" width={18} height={18} />
              {MODE_LABEL[m]}
              {m === mode && <Check size={16} strokeWidth={2.5} aria-hidden className={styles.check} />}
            </Link>
          ))}
        </div>
        <button type="button" className={styles.row} onClick={() => setSearching(true)}>
          <Search size={18} strokeWidth={2} aria-hidden /> Search
        </button>
        <FavoritesSection touch onNavigate={onClose} />
        <PageTree mode={mode} touch onNavigate={onClose} />
        <Link href="/settings" className={styles.row} onClick={onClose}>
          <Settings size={18} strokeWidth={2} aria-hidden /> Settings
        </Link>
      </div>
    </div>
  );
}
