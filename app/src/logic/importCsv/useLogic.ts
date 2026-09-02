'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { parseTransactionsCsv, type CsvImportResult, type ParsedTransactionCsvRow } from '@/src/shared/firestore/csv';
import { createTransactionWithAggregation } from '@/src/shared/firestore/aggregation';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx } = useCurrencyContext();

  const accountsByName = useMemo(() => new Map(accounts.map((a) => [a.name.toLowerCase(), { id: a.id }])), [accounts]);
  const categoriesByName = useMemo(
    () => new Map(categories.map((c) => [c.name.toLowerCase(), { id: c.id }])),
    [categories]
  );

  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [rowFailures, setRowFailures] = useState<{ rowNumber: number; message: string }[]>([]);
  const [done, setDone] = useState(false);

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setParseError(null);
    setDone(false);
    setRowFailures([]);
    setImportedCount(0);
    try {
      const text = await file.text();
      setResult(parseTransactionsCsv(text, accountsByName, categoriesByName));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not read that file.');
    }
  }

  function reset() {
    setFileName(null);
    setResult(null);
    setParseError(null);
    setDone(false);
    setRowFailures([]);
    setImportedCount(0);
    setImportTotal(0);
  }

  async function handleImport() {
    if (!uid || !result || result.rows.length === 0 || importing) return;
    setImporting(true);
    setImportTotal(result.rows.length);
    setImportedCount(0);
    const failures: { rowNumber: number; message: string }[] = [];

    // Sequential, not Promise.all — each row is its own real transaction
    // write (createTransactionWithAggregation), and importing hundreds of
    // rows concurrently would hammer the same account/statsMonthly/stats-
    // home docs with contended increments; one at a time keeps this both
    // gentle on Firestore and easy to show real progress for.
    for (const row of result.rows) {
      try {
        await importRow(uid, row, ctx);
      } catch (error) {
        failures.push({
          rowNumber: row.rowNumber,
          message: error instanceof Error ? error.message : 'Could not import this row.',
        });
      }
      setImportedCount((count) => count + 1);
    }

    setRowFailures(failures);
    setImporting(false);
    setDone(true);
  }

  function goBack() {
    router.push('/settings');
  }

  return {
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
    loading: accountsLoading || categoriesLoading,
  };
}

async function importRow(uid: string, row: ParsedTransactionCsvRow, ctx: ReturnType<typeof useCurrencyContext>['ctx']) {
  await createTransactionWithAggregation(
    {
      id: crypto.randomUUID(),
      date: row.date,
      type: row.type,
      description: row.description,
      accountId: row.accountId,
      categoryId: row.categoryId,
      amount: row.amount,
      direction: row.type === 'Income' ? 'Inflow' : 'Outflow',
      createdBy: uid,
    },
    ctx
  );
}
