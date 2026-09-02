'use client';

import { useRef } from 'react';
import { ChevronLeft, Upload } from 'lucide-react';
import { useLogic } from '@/src/logic/importCsv/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './ImportCsvScreen.module.css';

export function ImportCsvScreen() {
  const strings = useStrings();
  const {
    fileName,
    result,
    parseError,
    handleFile,
    reset,
    importing,
    importedCount,
    importTotal,
    rowFailures,
    done,
    handleImport,
    goBack,
    loading,
  } = useLogic();

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.importCsv.title}</h1>
      </header>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          {!fileName && (
            <>
              <button type="button" className={styles.fileButton} onClick={() => fileInputRef.current?.click()}>
                <Upload size={18} strokeWidth={2} />
                {strings.importCsv.chooseFile}
              </button>
              <p className={styles.hintText}>{strings.importCsv.hint}</p>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = '';
            }}
          />

          {fileName && !done && (
            <>
              <p className={styles.fileName}>{fileName}</p>

              {parseError && <p className={styles.errorText}>{parseError}</p>}

              {result && (
                <div className={styles.summaryCard}>
                  <div className={styles.summaryRow}>
                    <span>{strings.importCsv.readyLabel}</span>
                    <span className={styles.summaryValue}>{result.rows.length}</span>
                  </div>
                  {result.errors.length > 0 && (
                    <div className={styles.summaryRow}>
                      <span>{strings.importCsv.issuesLabel}</span>
                      <span className={styles.summaryValueDanger}>{result.errors.length}</span>
                    </div>
                  )}
                  {result.errors.length > 0 && (
                    <div className={styles.errorList}>
                      {result.errors.slice(0, 30).map((error, index) => (
                        <p key={index} className={styles.errorItem}>
                          Row {error.rowNumber}: {error.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {result && result.rows.length === 0 && <p className={styles.errorText}>{strings.importCsv.noRowsError}</p>}

              <button type="button" className={styles.linkButton} onClick={reset}>
                {strings.importCsv.changeFile}
              </button>

              {importing && (
                <>
                  <p className={styles.hintText}>
                    {strings.importCsv.importingLabel} {importedCount}/{importTotal}
                  </p>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${importTotal > 0 ? (importedCount / importTotal) * 100 : 0}%` }}
                    />
                  </div>
                </>
              )}

              {result && result.rows.length > 0 && !importing && (
                <button type="button" className={styles.saveButton} onClick={handleImport}>
                  {strings.importCsv.importButton} ({result.rows.length})
                </button>
              )}
            </>
          )}

          {done && (
            <div className={styles.summaryCard}>
              <p className={styles.fileName}>{strings.importCsv.doneTitle}</p>
              <div className={styles.summaryRow}>
                <span>{strings.importCsv.importedLabel}</span>
                <span className={styles.summaryValue}>{importTotal - rowFailures.length}</span>
              </div>
              {rowFailures.length > 0 && (
                <>
                  <div className={styles.summaryRow}>
                    <span>{strings.importCsv.failedLabel}</span>
                    <span className={styles.summaryValueDanger}>{rowFailures.length}</span>
                  </div>
                  <div className={styles.errorList}>
                    {rowFailures.map((failure, index) => (
                      <p key={index} className={styles.errorItem}>
                        Row {failure.rowNumber}: {failure.message}
                      </p>
                    ))}
                  </div>
                </>
              )}
              <button type="button" className={styles.saveButton} onClick={goBack}>
                {strings.importCsv.doneButton}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
