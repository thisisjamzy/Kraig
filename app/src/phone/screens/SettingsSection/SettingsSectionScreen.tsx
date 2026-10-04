'use client';

// One Settings section on a phone, as its own full-screen page in the
// BASELINE style: the usual header with an up arrow to Settings, the
// section's description, then its rows (src/settings, shared with the web
// dialog).

import { ChevronLeft } from 'lucide-react';
import { useLogic, sectionInfo, type SettingsSection } from '@/src/logic/settingsCenter/useLogic';
import { SettingsFrame, SettingsSectionView } from '@/src/settings/SettingsSections';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from '@/src/phone/screens/Settings/SettingsScreen.module.css';

export function SettingsSectionScreen({ section }: { section: SettingsSection }) {
  const v = useLogic();
  const goBack = useGoBack();
  const info = sectionInfo(section);
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={() => goBack('/settings')} aria-label="Back to Settings">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={info.label}
      />
      <p className={styles.profileEmail}>{info.description}</p>
      <SettingsFrame layout="phone">
        <SettingsSectionView id={section} v={v} showTitle={false} />
      </SettingsFrame>
    </div>
  );
}
