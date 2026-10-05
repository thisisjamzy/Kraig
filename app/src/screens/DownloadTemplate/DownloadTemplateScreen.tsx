'use client';

import { ChevronLeft, FileSpreadsheet } from 'lucide-react';
import { useLogic } from '@/src/logic/downloadTemplate/useLogic';
import { TEMPLATE_ABOUT, TEMPLATE_FILE, TEMPLATE_LABEL, type TemplateKind } from '@/src/shared/import/templates';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from './DownloadTemplateScreen.module.css';

const KINDS: TemplateKind[] = ['time', 'money'];

export function DownloadTemplateScreen() {
  const { download, busy, error, done, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Download template"
      />

      <p className={styles.helperText}>
        Pick a template. Each has a Read me sheet, an example row on every sheet and dropdowns for the columns with fixed values.
      </p>

      {KINDS.map((kind) => (
        <button key={kind} type="button" className={styles.option} disabled={busy !== null} onClick={() => void download(kind)}>
          <FileSpreadsheet size={20} strokeWidth={2} aria-hidden className={styles.optionIcon} />
          <span className={styles.optionText}>
            <span className={styles.optionTitle}>{busy === kind ? 'Preparing…' : TEMPLATE_LABEL[kind]}</span>
            <span className={styles.optionAbout}>{TEMPLATE_ABOUT[kind]}</span>
          </span>
        </button>
      ))}

      {error && <p className={styles.errorText}>{error}</p>}
      {done && <p className={styles.successText}>{TEMPLATE_FILE[done]} downloaded.</p>}
    </div>
  );
}
