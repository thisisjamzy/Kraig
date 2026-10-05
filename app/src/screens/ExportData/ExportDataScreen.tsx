'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/exportData/useLogic';
import { EntityPicker } from '@/src/widgets/EntityPicker/EntityPicker';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from './ExportDataScreen.module.css';

export function ExportDataScreen() {
  const { selected, setSelected, exporting, error, done, handleExport, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Export data"
      />

      <p className={styles.helperText}>
        Choose what to include. Everything you pick downloads as one Excel file, one sheet per entity.
      </p>

      <EntityPicker selected={selected} onChange={setSelected} />

      {error && <p className={styles.errorText}>{error}</p>}
      {done && !error && <p className={styles.successText}>Your export downloaded.</p>}

      <button
        type="button"
        className={styles.primaryButton}
        disabled={selected.size === 0 || exporting}
        onClick={() => void handleExport()}
      >
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </div>
  );
}
