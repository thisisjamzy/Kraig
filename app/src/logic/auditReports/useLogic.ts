'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateAuditReport,
  saveAuditReport,
  listAuditReports,
  deleteAuditReport,
  type AuditPeriodType,
  type FirestoreAuditReport,
} from '@/src/shared/firestore/auditReport';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

const QUARTER_LABELS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function currentYear() {
  return new Date().getFullYear();
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [period, setPeriod] = useState<AuditPeriodType>('Month');
  const [year, setYear] = useState(currentYear());
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [quarterIndex, setQuarterIndex] = useState(Math.floor(new Date().getMonth() / 3));

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear() - i);

  const [reports, setReports] = useState<FirestoreAuditReport[] | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!uid) return;
    setReportsLoading(true);
    setReportsError(null);
    try {
      const rows = await listAuditReports(uid);
      setReports(rows);
    } catch (err) {
      setReportsError(err instanceof Error ? err.message : 'Could not load past reports.');
    } finally {
      setReportsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!uid || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const index = period === 'Month' ? monthIndex : period === 'Quarter' ? quarterIndex : 0;
      const selection = { period, year, index };
      const data = await generateAuditReport(uid, selection);
      const id = await saveAuditReport(uid, selection, data);
      router.push(`/settings/audit-reports/${id}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Could not generate this report.');
      setGenerating(false);
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(reportId: string) {
    if (!uid || deletingId) return;
    setDeletingId(reportId);
    try {
      await deleteAuditReport(uid, reportId);
      setReports((current) => current?.filter((r) => r.id !== reportId) ?? null);
    } finally {
      setDeletingId(null);
    }
  }

  function openReport(reportId: string) {
    router.push(`/settings/audit-reports/${reportId}`);
  }

  function goBack() {
    router.push('/settings');
  }

  return {
    period,
    setPeriod,
    year,
    setYear,
    yearOptions,
    monthIndex,
    setMonthIndex,
    monthLabels: MONTH_LABELS,
    quarterIndex,
    setQuarterIndex,
    quarterLabels: QUARTER_LABELS,

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
  };
}
