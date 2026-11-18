'use client';

// Time's screen switcher on a phone (Dreda v1.0 Profile / Phone 68608,
// BUILD-KIT v1.0 section 5.2), opened from the Profile tab: the profile
// card, the Time and Money switch, then Plan, Organise, Review and
// settings. It sits under the tab bar, which stays showing with Profile
// lit. It is the phone line's own MoreSheet: the phone line never imports
// the web shell (docs/UI-LINES.md).

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Archive, AtSign, Sun, ChartPie, SlidersHorizontal, ChevronRight, FileText, Folder, House, Layers, LayoutGrid, Link2, Users, type LucideIcon } from 'lucide-react';
import { MODE_HOME, MODE_LABEL, type AppMode } from '@/src/shared/config/pageTree';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useSyncStatus } from '@/src/shared/hooks/useSyncStatus';
import { useTimeCounts } from '@/src/shared/hooks/useTimeCounts';
import { avatarSrc, PROFILE_AVATAR_ID } from '@/src/viewmodels/people';
import styles from '@/src/phone/widgets/ProfileSheet/ProfileSheet.module.css';

interface ProfileRow {
  href: string;
  label: string;
  icon: LucideIcon;
  note?: string;
}

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { user } = useFirebaseUser();
  const sync = useSyncStatus();
  const counts = useTimeCounts();
  const name = user?.displayName || user?.email || 'You';

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

  const groups: { label: string; rows: ProfileRow[] }[] = [
    {
      label: 'Plan',
      rows: [
        { href: '/projects/insights', label: 'Home', icon: House, note: 'Dashboard' },
        { href: '/projects', label: 'Today', icon: Sun },
        { href: '/projects/calendar/links', label: 'Scheduling', icon: Link2 },
      ],
    },
    {
      label: 'Organise',
      rows: [
        { href: '/areas', label: 'Areas', icon: LayoutGrid, note: String(counts.areas) },
        { href: '/sections', label: 'Folders', icon: Folder, note: String(counts.folders) },
        { href: '/projects/all', label: 'Projects', icon: Layers, note: String(counts.projects) },
        { href: '/people', label: 'People', icon: AtSign },
        { href: '/library', label: 'Library', icon: FileText },
      ],
    },
    {
      label: 'Review and settings',
      rows: [
        { href: '/projects/analytics', label: 'Insights', icon: ChartPie },
        { href: '/settings/planning', label: 'Planning', icon: SlidersHorizontal },
        { href: '/library?tab=archive', label: 'Archive', icon: Archive },
        { href: '/settings', label: 'Account', icon: Users },
      ],
    },
  ];

  return (
    <div className={styles.layer} role="dialog" aria-modal="true" aria-label="Profile">
      <h1 className={styles.title}>Profile</h1>
      <div className={styles.body}>
        <div className={styles.card} data-who>
          <span className={styles.face} aria-hidden>
            <Image src={avatarSrc(PROFILE_AVATAR_ID)} alt="" width={40} height={40} unoptimized />
          </span>
          <span className={styles.whoText}>
            <span className={styles.whoName}>{name}</span>
            <span className={styles.whoMeta}>Personal · {sync}</span>
          </span>
        </div>

        <div className={styles.segmented} role="group" aria-label="Module">
          {(['time', 'money'] as AppMode[]).map((m) => (
            <Link key={m} href={MODE_HOME[m]} className={styles.segment} aria-current={m === 'time' ? 'true' : undefined} onClick={onClose}>
              {MODE_LABEL[m]}
            </Link>
          ))}
        </div>

        {groups.map((group) => (
          <section key={group.label} className={styles.group} aria-label={group.label}>
            <p className={styles.groupLabel}>{group.label}</p>
            <ul className={styles.card}>
              {group.rows.map(({ href, label, icon: Icon, note }) => (
                <li key={href}>
                  <Link href={href} className={styles.row} onClick={onClose}>
                    <Icon size={20} strokeWidth={2} aria-hidden />
                    <span className={styles.rowLabel}>{label}</span>
                    {note && <span className={styles.rowNote}>{note}</span>}
                    <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
