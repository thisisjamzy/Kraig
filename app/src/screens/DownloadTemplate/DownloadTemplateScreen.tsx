'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/downloadTemplate/useLogic';
import { EntityPicker } from '@/src/widgets/EntityPicker/EntityPicker';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from './DownloadTemplateScreen.module.css';

export function DownloadTemplateScreen() {
  const { selected, setSelected, keys, done, handleDownload, goBack } = useLogic();

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
        Pick what you plan to fill in. You&rsquo;ll get one Excel file with a tab per entity, a header row plus a
        couple of example rows to follow.
      </p>

      <EntityPicker selected={selected} onChange={setSelected} keys={keys} />

      <p className={styles.helperText}>
        Areas, folders, projects and tasks have their own template: <Link href="/settings/import">Import tasks</Link> and download the task list template there.
      </p>

      {done && <p className={styles.successText}>Your template downloaded.</p>}

      <button type="button" className={styles.primaryButton} disabled={selected.size === 0} onClick={handleDownload}>
        Download template
      </button>
    </div>
  );
}
