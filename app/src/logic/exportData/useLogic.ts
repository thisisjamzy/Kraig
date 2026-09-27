'use client';

import { useState } from 'react';
import { getDocs, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import {
  areasRef,
  sectionsRef,
  accountsRef,
  categoriesRef,
  projectsRef,
  tasksRef,
  bucketsRef,
  bucketLineItemsRef,
  debtsRef,
  repaymentsRef,
  transactionsRef,
  transfersRef,
} from '@/src/shared/firestore/refs';
import { ENTITY_ORDER, type EntityKey } from '@/src/shared/firestore/dataEntities';
import { buildExportWorkbook, downloadWorkbook, type ExportData, type ExportLookups } from '@/src/shared/firestore/dataWorkbook';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type {
  FirestoreArea,
  FirestoreSection,
  FirestoreAccount,
  FirestoreCategory,
  FirestoreProject,
  FirestoreTask,
  FirestoreBucket,
  FirestoreBucketLineItem,
  FirestoreDebt,
  FirestoreRepayment,
  FirestoreTransaction,
  FirestoreTransfer,
} from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

function docs<T>(snap: QuerySnapshot<DocumentData>): T[] {
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
}

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const [selected, setSelected] = useState<Set<EntityKey>>(new Set(ENTITY_ORDER));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleExport() {
    if (!uid || exporting || selected.size === 0) return;
    setExporting(true);
    setError(null);
    setDone(false);
    try {
      // Every collection is fetched regardless of which sheets were
      // checked — a Transaction sheet still needs real Account/Category
      // names even if those entities' own sheets weren't selected.
      const [
        areasSnap,
        sectionsSnap,
        accountsSnap,
        categoriesSnap,
        projectsSnap,
        tasksSnap,
        bucketsSnap,
        debtsSnap,
        transactionsSnap,
        transfersSnap,
      ] = await Promise.all([
        getDocs(areasRef(uid)),
        getDocs(sectionsRef(uid)),
        getDocs(accountsRef(uid)),
        getDocs(categoriesRef(uid)),
        getDocs(projectsRef(uid)),
        getDocs(tasksRef(uid)),
        getDocs(bucketsRef(uid)),
        getDocs(debtsRef(uid)),
        getDocs(transactionsRef(uid)),
        getDocs(transfersRef(uid)),
      ]);

      const buckets = docs<FirestoreBucket>(bucketsSnap);
      const debts = docs<FirestoreDebt>(debtsSnap);

      // Line items and repayments live in per-parent subcollections — fetch
      // each parent's own subcollection, sequentially (a household's own
      // bucket/debt count is small; this mirrors this codebase's general
      // "sequential over a handful of docs" convention rather than firing
      // an unbounded number of parallel reads).
      const bucketItems: FirestoreBucketLineItem[] = [];
      for (const bucket of buckets) {
        const snap = await getDocs(bucketLineItemsRef(uid, bucket.id));
        bucketItems.push(...docs<FirestoreBucketLineItem>(snap));
      }
      const repayments: FirestoreRepayment[] = [];
      for (const debt of debts) {
        const snap = await getDocs(repaymentsRef(uid, debt.id));
        repayments.push(...docs<FirestoreRepayment>(snap));
      }

      const data: ExportData = {
        areas: docs<FirestoreArea>(areasSnap),
        sections: docs<FirestoreSection>(sectionsSnap),
        accounts: docs<FirestoreAccount>(accountsSnap),
        categories: docs<FirestoreCategory>(categoriesSnap),
        projects: docs<FirestoreProject>(projectsSnap),
        tasks: docs<FirestoreTask>(tasksSnap),
        buckets,
        bucketItems,
        debts,
        repayments,
        transactions: docs<FirestoreTransaction>(transactionsSnap),
        transfers: docs<FirestoreTransfer>(transfersSnap),
      };

      const lookups: ExportLookups = {
        areaName: new Map(data.areas.map((a) => [a.id, a.name])),
        sectionName: new Map(data.sections.map((b) => [b.id, b.name])),
        accountName: new Map(data.accounts.map((a) => [a.id, a.name])),
        categoryName: new Map(data.categories.map((c) => [c.id, c.name])),
        projectName: new Map(data.projects.map((p) => [p.id, p.name])),
        bucketName: new Map(data.buckets.map((g) => [g.id, g.name])),
        debtName: new Map(data.debts.map((d) => [d.id, d.name])),
      };

      const workbook = buildExportWorkbook([...selected], data, lookups);
      downloadWorkbook(workbook, `dreda-export-${isoToday()}.xlsx`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  // Back to the page the user came from (skipping forms); '/settings' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings');
  }

  return { selected, setSelected, exporting, error, done, handleExport, goBack };
}
