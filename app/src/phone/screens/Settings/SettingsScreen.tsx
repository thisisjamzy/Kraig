'use client';

// Settings on a phone: the BASELINE settings list. The profile card, then
// each group's sections as rows; a section opens as its own full-screen
// page (/settings/<section>), Notifications its existing one. Sign out last.

import Link from 'next/link';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useLogic as useAccount } from '@/src/logic/settings/useLogic';
import { SETTINGS_GROUPS } from '@/src/logic/settingsCenter/sections';
import { settingsPageHref } from '@/src/shared/navigation/settingsLink';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { iconTint } from '@/src/viewmodels/iconTint';
import styles from '@/src/phone/screens/Settings/SettingsScreen.module.css';

export function SettingsScreen() {
  const { user, handleSignOut, goBack } = useAccount();
  let index = 0;

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Settings"
      />

      <Link href={settingsPageHref('profile')} className={styles.profileCard}>
        <span className={styles.avatar}>{user.name.charAt(0)}</span>
        <div className={styles.profileText}>
          <p className={styles.profileName}>{user.name}</p>
          <p className={styles.profileEmail}>{user.email}</p>
        </div>
      </Link>

      {SETTINGS_GROUPS.map((group) => (
        <section key={group.label || 'more'} className={styles.section}>
          {group.label && <h2 className={styles.sectionTitle}>{group.label}</h2>}
          {group.sections
            .filter((s) => s.id !== 'profile')
            .map((s) => (
              <Link key={s.id} href={settingsPageHref(s.id)} className={styles.actionRow}>
                <span className={styles.actionRowIcon} style={{ background: iconTint(index++) }} aria-hidden />
                <span className={styles.actionRowText}>
                  <span className={styles.actionRowLabel}>{s.label}</span>
                  <span className={styles.actionRowMeta}>{s.description}</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
              </Link>
            ))}
        </section>
      ))}

      <button type="button" className={styles.signOutButton} onClick={handleSignOut}>
        <LogOut size={18} strokeWidth={1.75} />
        Sign out
      </button>
    </div>
  );
}
