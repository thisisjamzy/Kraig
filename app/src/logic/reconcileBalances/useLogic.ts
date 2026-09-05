'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  auditAccountBalances,
  applyBalanceCorrections,
  type AccountAudit,
  type OrphanedEntry,
} from '@/src/shared/firestore/reconciliation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [status, setStatus] = useState<'idle' | 'auditing' | 'reviewing' | 'applying' | 'applied'>('idle');
  const [results, setResults] = useState<AccountAudit[] | null>(null);
  const [orphaned, setOrphaned] = useState<OrphanedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  // Every mismatched account starts pre-selected — the common case is
  // "apply everything the audit found", per-row unchecking is the escape
  // hatch for a household that wants to double check one before committing.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const mismatches = useMemo(() => results?.filter((row) => row.difference !== 0) ?? [], [results]);
  const clean = useMemo(() => results?.filter((row) => row.difference === 0) ?? [], [results]);
  const negativeAccounts = useMemo(() => results?.filter((row) => row.goesNegative) ?? [], [results]);
  const totalTransactions = useMemo(() => results?.reduce((sum, row) => sum + row.transactionCount, 0) ?? 0, [results]);
  const totalTransfers = useMemo(() => results?.reduce((sum, row) => sum + row.transferCount, 0) ?? 0, [results]);

  async function runAudit() {
    if (!uid || status === 'auditing') return;
    setStatus('auditing');
    setError(null);
    try {
      const audit = await auditAccountBalances(uid);
      setResults(audit.accounts);
      setOrphaned(audit.orphaned);
      setSelectedIds(new Set(audit.accounts.filter((row) => row.difference !== 0).map((row) => row.accountId)));
      setCheckedAt(new Date());
      setStatus('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the audit.');
      setStatus('idle');
    }
  }

  const toggleSelected = useCallback((accountId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  async function applyCorrections() {
    if (!uid || !results || status === 'applying') return;
    const selected = mismatches.filter((row) => selectedIds.has(row.accountId));
    if (selected.length === 0) return;
    setStatus('applying');
    setError(null);
    try {
      await applyBalanceCorrections(
        uid,
        selected.map((row) => ({ accountId: row.accountId, expectedBalance: row.expectedBalance }))
      );
      // Re-run rather than patch local state by hand — confirms the write
      // actually landed and picks up anything else that changed underneath
      // (e.g. a transaction someone else on the household logged mid-review).
      const audit = await auditAccountBalances(uid);
      setResults(audit.accounts);
      setOrphaned(audit.orphaned);
      setSelectedIds(new Set(audit.accounts.filter((row) => row.difference !== 0).map((row) => row.accountId)));
      setCheckedAt(new Date());
      setStatus('applied');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the correction.');
      setStatus('reviewing');
    }
  }

  function goBack() {
    router.push('/settings');
  }

  return {
    status,
    results,
    mismatches,
    clean,
    negativeAccounts,
    orphaned,
    totalTransactions,
    totalTransfers,
    selectedIds,
    toggleSelected,
    error,
    checkedAt,
    runAudit,
    applyCorrections,
    goBack,
  };
}
