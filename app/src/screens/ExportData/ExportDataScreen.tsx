'use client';

import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/exportData/useLogic';
import { EntityPicker } from '@/src/widgets/EntityPicker/EntityPicker';
import styles from './ExportDataScreen.module.css';

export function ExportDataScreen() {
  const { selected, setSelected, exporting, error, done, handleExport, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Export data</h1>
      </header>

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
        onClick={handleExport}
      >
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </div>
  );
}
