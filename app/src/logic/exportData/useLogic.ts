'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDocs, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import {
  areasRef,
  bucketsRef,
  accountsRef,
  categoriesRef,
  budgetRulesRef,
  projectsRef,
  tasksRef,
  goalsRef,
  goalLineItemsRef,
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
  FirestoreBucket,
  FirestoreAccount,
  FirestoreCategory,
  FirestoreBudgetRule,
  FirestoreProject,
  FirestoreTask,
  FirestoreGoal,
  FirestoreGoalLineItem,
  FirestoreDebt,
  FirestoreRepayment,
  FirestoreTransaction,
  FirestoreTransfer,
} from '@/src/shared/firestore/types';

function docs<T>(snap: QuerySnapshot<DocumentData>): T[] {
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
}

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function useLogic() {
  const router = useRouter();
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
        bucketsSnap,
        accountsSnap,
        categoriesSnap,
        budgetsSnap,
        projectsSnap,
        tasksSnap,
        goalsSnap,
        debtsSnap,
        transactionsSnap,
        transfersSnap,
      ] = await Promise.all([
        getDocs(areasRef(uid)),
        getDocs(bucketsRef(uid)),
        getDocs(accountsRef(uid)),
        getDocs(categoriesRef(uid)),
        getDocs(budgetRulesRef(uid)),
        getDocs(projectsRef(uid)),
        getDocs(tasksRef(uid)),
        getDocs(goalsRef(uid)),
        getDocs(debtsRef(uid)),
        getDocs(transactionsRef(uid)),
        getDocs(transfersRef(uid)),
      ]);

      const goals = docs<FirestoreGoal>(goalsSnap);
      const debts = docs<FirestoreDebt>(debtsSnap);

      // Line items and repayments live in per-parent subcollections — fetch
      // each parent's own subcollection, sequentially (a household's own
      // goal/debt count is small; this mirrors this codebase's general
      // "sequential over a handful of docs" convention rather than firing
      // an unbounded number of parallel reads).
      const goalItems: FirestoreGoalLineItem[] = [];
      for (const goal of goals) {
        const snap = await getDocs(goalLineItemsRef(uid, goal.id));
        goalItems.push(...docs<FirestoreGoalLineItem>(snap));
      }
      const repayments: FirestoreRepayment[] = [];
      for (const debt of debts) {
        const snap = await getDocs(repaymentsRef(uid, debt.id));
        repayments.push(...docs<FirestoreRepayment>(snap));
      }

      const data: ExportData = {
        areas: docs<FirestoreArea>(areasSnap),
        buckets: docs<FirestoreBucket>(bucketsSnap),
        accounts: docs<FirestoreAccount>(accountsSnap),
        categories: docs<FirestoreCategory>(categoriesSnap),
        budgets: docs<FirestoreBudgetRule>(budgetsSnap),
        projects: docs<FirestoreProject>(projectsSnap),
        tasks: docs<FirestoreTask>(tasksSnap),
        goals,
        goalItems,
        debts,
        repayments,
        transactions: docs<FirestoreTransaction>(transactionsSnap),
        transfers: docs<FirestoreTransfer>(transfersSnap),
      };

      const lookups: ExportLookups = {
        areaName: new Map(data.areas.map((a) => [a.id, a.name])),
        bucketName: new Map(data.buckets.map((b) => [b.id, b.name])),
        accountName: new Map(data.accounts.map((a) => [a.id, a.name])),
        categoryName: new Map(data.categories.map((c) => [c.id, c.name])),
        projectName: new Map(data.projects.map((p) => [p.id, p.name])),
        goalName: new Map(data.goals.map((g) => [g.id, g.name])),
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

  function goBack() {
    router.push('/settings');
  }

  return { selected, setSelected, exporting, error, done, handleExport, goBack };
}
