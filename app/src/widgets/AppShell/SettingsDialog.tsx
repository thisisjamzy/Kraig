'use client';

// Settings on tablet and web: a Notion-like dialog over the current page
// (about 1100 by 720, never more than 90% of the screen), its sections in a
// 240px light grey navigation on the left and the chosen one on the right.
// The URL says which (?settings=preferences); Esc or the close icon closes
// it. The sections themselves are shared with the phone (src/settings).

import { useEffect } from 'react';
import { LogOut, X } from 'lucide-react';
import { useLogic, SETTINGS_GROUPS, type SettingsSection } from '@/src/logic/settingsCenter/useLogic';
import { SettingsFrame, SettingsSectionView } from '@/src/settings/SettingsSections';
import { useWebOnly } from '@/src/shared/device/useWebOnly';
import styles from './SettingsDialog.module.css';

export function SettingsDialog({ section, onSection, onClose }: { section: SettingsSection; onSection: (next: SettingsSection) => void; onClose: () => void }) {
  useWebOnly('SettingsDialog');
  const v = useLogic();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      data-panel-open
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Settings">
        <nav className={styles.nav} aria-label="Settings sections">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label || 'more'} className={styles.navGroup}>
              {group.label && <span className={styles.navGroupLabel}>{group.label}</span>}
              {group.sections.map((s) => (
                <button key={s.id} type="button" className={styles.navRow} aria-current={s.id === section ? 'page' : undefined} onClick={() => onSection(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          ))}
          <button type="button" className={styles.navRow} data-danger onClick={v.signOut}>
            <LogOut size={15} strokeWidth={2} aria-hidden />
            Sign out
          </button>
        </nav>
        <div className={styles.content}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close settings">
            <X size={18} strokeWidth={2} />
          </button>
          <SettingsFrame layout="web">
            <SettingsSectionView id={section} v={v} />
          </SettingsFrame>
        </div>
      </div>
    </div>
  );
}
