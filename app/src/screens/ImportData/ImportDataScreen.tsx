'use client';

import { useRef } from 'react';
import { ChevronLeft, Upload } from 'lucide-react';
import { useLogic } from '@/src/logic/importData/useLogic';
import { ENTITY_DEFS } from '@/src/shared/firestore/dataEntities';
import styles from './ImportDataScreen.module.css';

export function ImportDataScreen() {
  const {
    step,
    fileName,
    uploadError,
    loading,
    handleFile,
    unrecognizedSheets,
    parseSummaries,
    missingRefs,
    autoCreateChoices,
    toggleAutoCreate,
    cancelReview,
    handleCommit,
    committing,
    commitProgress,
    commitSummaries,
    goBack,
  } = useLogic();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoCreateRefs = missingRefs.filter((m) => m.mode === 'autoCreate');
  const hardRequiredRefs = missingRefs.filter((m) => m.mode === 'hardRequired');
  const totalErrors = parseSummaries.reduce((sum, s) => sum + s.errorCount, 0);
  const totalValid = parseSummaries.reduce((sum, s) => sum + s.validCount, 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Import data</h1>
      </header>

      {step === 'upload' && (
        <div className={styles.form}>
          <p className={styles.helperText}>
            Upload a Dreda export or template (.xlsx or .csv). Each sheet is matched by name — Areas, Buckets,
            Accounts, Categories, Budgets, Projects, Tasks, Goals, Goal Items, Debts, Repayments, Transactions,
            Transfers.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className={styles.fileInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button type="button" className={styles.primaryButton} onClick={() => fileInputRef.current?.click()} disabled={loading}>
            <Upload size={16} strokeWidth={2} />
            {loading ? 'Reading…' : fileName ?? 'Choose a file'}
          </button>
          {uploadError && <p className={styles.errorText}>{uploadError}</p>}
        </div>
      )}

      {step === 'review' && (
        <div className={styles.form}>
          {unrecognizedSheets.length > 0 && (
            <p className={styles.warningText}>
              Skipped unrecognized sheet{unrecognizedSheets.length === 1 ? '' : 's'}: {unrecognizedSheets.join(', ')}
            </p>
          )}

          <p className={styles.summaryText}>
            {totalValid} row{totalValid === 1 ? '' : 's'} ready to import
            {totalErrors > 0 ? `, ${totalErrors} with errors that will be skipped` : ''}.
          </p>

          {parseSummaries
            .filter((s) => s.errorCount > 0)
            .map((s) => (
              <div key={s.entityKey} className={styles.errorGroup}>
                <p className={styles.errorGroupTitle}>{ENTITY_DEFS[s.entityKey].label}</p>
                {s.errors.map((e, i) => (
                  <p key={i} className={styles.errorText}>
                    Row {e.rowNumber}: {e.message}
                  </p>
                ))}
              </div>
            ))}

          {autoCreateRefs.length > 0 && (
            <div className={styles.reviewGroup}>
              <p className={styles.reviewGroupTitle}>These don&rsquo;t exist yet — create them automatically?</p>
              {autoCreateRefs.map((m) => (
                <label key={m.key} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={autoCreateChoices.get(m.key) ?? true}
                    onChange={() => toggleAutoCreate(m.key)}
                  />
                  {ENTITY_DEFS[m.entityKey].label.replace(/s$/, '')}: {m.name}
                </label>
              ))}
            </div>
          )}

          {hardRequiredRefs.length > 0 && (
            <div className={styles.reviewGroup}>
              <p className={styles.reviewGroupTitle}>Not found — rows needing these will be skipped:</p>
              {hardRequiredRefs.map((m) => (
                <p key={m.key} className={styles.warningText}>
                  {ENTITY_DEFS[m.entityKey].label.replace(/s$/, '')}: {m.name}
                </p>
              ))}
            </div>
          )}

          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryButton} onClick={cancelReview}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} disabled={totalValid === 0} onClick={handleCommit}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'summary' && (
        <div className={styles.form}>
          {committing ? (
            <>
              <p className={styles.summaryText}>
                Importing… {commitProgress.done} of {commitProgress.total}
              </p>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${commitProgress.total > 0 ? (commitProgress.done / commitProgress.total) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className={styles.summaryText}>Import complete.</p>
              {commitSummaries.map((s) => (
                <div key={s.entityKey} className={styles.resultGroup}>
                  <p className={styles.resultGroupTitle}>
                    {ENTITY_DEFS[s.entityKey].label}: {s.created} created
                    {s.skipped > 0 ? `, ${s.skipped} skipped` : ''}
                  </p>
                  {s.skipReasons.map((r, i) => (
                    <p key={`skip-${i}`} className={styles.warningText}>
                      {r}
                    </p>
                  ))}
                  {s.writeErrors.map((r, i) => (
                    <p key={`err-${i}`} className={styles.errorText}>
                      {r}
                    </p>
                  ))}
                </div>
              ))}
              <button type="button" className={styles.primaryButton} onClick={cancelReview}>
                Import another file
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
