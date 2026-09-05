'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/auditReports/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import type { AuditPeriodType, FirestoreAuditReport } from '@/src/shared/firestore/auditReport';
import styles from './AuditReportsScreen.module.css';

export function AuditReportsScreen() {
  const strings = useStrings();
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<FirestoreAuditReport | null>(null);
  const {
    period,
    setPeriod,
    year,
    setYear,
    yearOptions,
    monthIndex,
    setMonthIndex,
    monthLabels,
    quarterIndex,
    setQuarterIndex,
    quarterLabels,
    reports,
    reportsLoading,
    reportsError,
    openReport,
    deletingId,
    handleDelete,
    generating,
    generateError,
    handleGenerate,
    goBack,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.common.back}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.auditReports.title}</h1>
      </header>

      <div className={styles.generateCard}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>{strings.auditReports.periodLabel}</label>
          <div className={styles.periodTabs}>
            {(['Month', 'Quarter', 'Year'] as AuditPeriodType[]).map((option) => (
              <button
                key={option}
                type="button"
                className={period === option ? `${styles.periodTab} ${styles.periodTabActive}` : styles.periodTab}
                onClick={() => setPeriod(option)}
              >
                {option === 'Month' ? strings.auditReports.periodMonth : option === 'Quarter' ? strings.auditReports.periodQuarter : strings.auditReports.periodYear}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pickerRow}>
          {period !== 'Year' && (
            <div className={styles.formField}>
              <label className={styles.formLabel}>{period === 'Month' ? strings.auditReports.monthLabel : strings.auditReports.quarterLabel}</label>
              {period === 'Month' ? (
                <select className={styles.formInput} value={monthIndex} onChange={(e) => setMonthIndex(Number(e.target.value))}>
                  {monthLabels.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <select className={styles.formInput} value={quarterIndex} onChange={(e) => setQuarterIndex(Number(e.target.value))}>
                  {quarterLabels.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel}>{strings.auditReports.yearLabel}</label>
            <select className={styles.formInput} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {generateError && <p className={styles.errorText}>{generateError}</p>}

        <button type="button" className={styles.generateButton} disabled={generating} onClick={handleGenerate}>
          {generating ? strings.auditReports.generatingLabel : strings.auditReports.generateButton}
        </button>
      </div>

      <p className={styles.listTitle}>{strings.auditReports.pastReportsTitle}</p>

      <ScreenState loading={reportsLoading} error={reportsError} />

      {!reportsLoading && !reportsError && reports && reports.length === 0 && (
        <p className={styles.emptyText}>{strings.auditReports.noReports}</p>
      )}

      {!reportsLoading && !reportsError && reports && reports.length > 0 && (
        <div className={styles.list}>
          {reports.map((report) => (
            <div key={report.id} className={styles.reportRow} onClick={() => openReport(report.id)}>
              <div className={styles.reportInfo}>
                <span className={styles.reportLabel}>{report.periodLabel}</span>
                <span className={styles.reportMeta}>
                  {strings.auditReports.generatedAtPrefix} {report.generatedAt.toDate().toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={strings.auditReports.deleteReport}
                disabled={deletingId === report.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmDeleteReport(report);
                }}
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
              <ChevronRight size={16} strokeWidth={2} className={styles.reportChevron} />
            </div>
          ))}
        </div>
      )}

      {confirmDeleteReport && (
        <ConfirmDialog
          title={strings.auditReports.deleteReportConfirmTitle}
          message={strings.auditReports.deleteReportConfirmMessage}
          confirmLabel={strings.auditReports.deleteReport}
          cancelLabel={strings.common.cancel}
          onCancel={() => setConfirmDeleteReport(null)}
          onConfirm={() => {
            handleDelete(confirmDeleteReport.id);
            setConfirmDeleteReport(null);
          }}
        />
      )}
    </div>
  );
}
