'use client';

// A generic "nothing here yet" screen — same shape as Notifications' own
// placeholder (back arrow + title header, centered icon + one line of
// body text), parameterized so it can back more than one route without
// duplicating that shape. Currently used by the Time drawer's own "Address
// Book" and "Resources" links (src/widgets/WebSidebar/WebSidebar.tsx) —
// two of the reference dashboard's exact nav labels that have no real
// feature behind them in this app yet, so they land here rather than a
// dead link or a route that silently does something unrelated.

import { useRouter } from 'next/navigation';
import { BookOpen, ChevronLeft, Contact, Settings } from 'lucide-react';
import styles from './ComingSoonScreen.module.css';

// A string key, not the icon component itself — this screen is a Client
// Component but its page.tsx callers (app/(mobile)/address-book,
// app/(mobile)/resources, app/(mobile)/projects/control-panel) are plain
// Server Components, and a component reference (a function) can't cross
// that boundary as a prop, only serializable values like this string can.
const ICONS = { contact: Contact, 'book-open': BookOpen, settings: Settings } as const;

export function ComingSoonScreen({ title, message, icon }: { title: string; message: string; icon: keyof typeof ICONS }) {
  const router = useRouter();
  const Icon = ICONS[icon];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => router.back()} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <div className={styles.emptyState}>
        <Icon size={32} strokeWidth={1.5} />
        <p className={styles.emptyText}>{message}</p>
      </div>
    </div>
  );
}
