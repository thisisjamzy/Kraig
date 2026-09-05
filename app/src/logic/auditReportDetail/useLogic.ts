'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuditReport, type FirestoreAuditReport } from '@/src/shared/firestore/auditReport';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function useLogic(reportId: string) {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseUser();
  const uid = user?.uid;

  const [report, setReport] = useState<FirestoreAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !uid) return;
    let cancelled = false;
    setLoading(true);
    getAuditReport(uid, reportId)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load this report.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, authLoading, reportId]);

  function goBack() {
    router.push('/settings/audit-reports');
  }

  // "Export as PDF": the browser's own print-to-PDF, driven by
  // AuditReportDetailScreen.module.css's @media print rules (hides the
  // header/back/export chrome, keeps only the report content) — no PDF
  // rendering library needed, works offline, and every browser's print
  // dialog already offers "Save as PDF" as a destination.
  function exportPdf() {
    window.print();
  }

  return {
    report,
    data: report?.data ?? null,
    loading: authLoading || loading,
    error,
    notFound: !loading && !error && !report,
    goBack,
    exportPdf,
  };
}
