'use client';

// A lightweight month-grid + day-agenda calendar over tasks (by dueDate)
// and projects (by startDate/endDate) — the Google Calendar bridge and the
// dedicated calendarEvents collection PRD Files/PRD-PROJECTS.md section 16
// specs are later build steps; this reads directly off tasks/projects,
// which is everything a household's own due dates actually need for now.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query } from 'firebase/firestore';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { useBuckets } from '@/src/shared/firestore/queries';
import { projectsRef, areasRef, plannedPaymentsRef } from '@/src/shared/firestore/refs';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useAccounts, useCategories, useCurrencyContext } from '@/src/shared/firestore/queries';
import { computeUpcomingPayments } from '@/src/shared/firestore/upcomingPayments';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreProject, FirestoreArea, FirestorePlannedPayment } from '@/src/shared/firestore/types';

// Payments are "upcoming from today," not tied to the month being browsed
// (see upcomingPayments.ts's own header — same forward-looking model the
// Payments Calendar screen already uses) — a wide horizon so browsing a few
// months ahead still surfaces them, rather than recomputing per month.
const PAYMENT_HORIZON_DAYS = 400;

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useLogic() {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const today = useMemo(() => new Date(), []);
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => isoDate(today));

  const { data: tasks, loading: tasksLoading } = useAllTasks();
  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid)) : null), [uid]);
  const { data: projectDocs, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const projects = projectDocs.filter((p) => p.status !== 'Archived');
  const projectName = useMemo(() => new Map(projectDocs.map((p) => [p.id, p.name])), [projectDocs]);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid)) : null), [uid]);
  const { data: areaDocs } = useFirestoreCollection<FirestoreArea>(areasQuery);
  const areaName = useMemo(() => new Map(areaDocs.map((a) => [a.id, a.name])), [areaDocs]);

  const { data: bucketDocs } = useBuckets();
  const bucketName = useMemo(() => new Map(bucketDocs.map((b) => [b.id, b.name])), [bucketDocs]);

  const paymentsQuery = useMemo(() => (uid ? query(plannedPaymentsRef(uid)) : null), [uid]);
  const { data: paymentDocs, loading: paymentsLoading } = useFirestoreCollection<FirestorePlannedPayment>(paymentsQuery);
  const { data: accounts, loading: accountsLoading } = useAccounts();
  const { data: categories, loading: categoriesLoading } = useCategories();
  const { ctx, loading: ctxLoading } = useCurrencyContext();
  const payments = useMemo(
    () =>
      computeUpcomingPayments(
        paymentDocs.filter((p) => !p.archived),
        accounts,
        categories,
        ctx,
        PAYMENT_HORIZON_DAYS
      ),
    [paymentDocs, accounts, categories, ctx]
  );

  const daysWithItems = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.dueDate) set.add(isoDate(t.dueDate.toDate()));
    }
    for (const p of projects) {
      if (p.startDate) set.add(isoDate(p.startDate.toDate()));
      if (p.endDate) set.add(isoDate(p.endDate.toDate()));
    }
    for (const payment of payments) {
      set.add(payment.dueDate);
    }
    return set;
  }, [tasks, projects, payments]);

  const agenda = useMemo(() => {
    const taskItems = tasks
      .filter((t) => t.dueDate && isoDate(t.dueDate.toDate()) === selectedDate)
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        emoji: t.emoji ?? null,
        type: t.type ?? 'ToDo',
        priority: t.priority ?? DEFAULT_PRIORITY,
        startTime: t.startTime ? t.startTime.toDate() : null,
        dueDate: t.dueDate!.toDate(),
        done: t.done,
        status: t.status,
        projectName: t.projectId ? projectName.get(t.projectId) ?? null : null,
        bucketName: t.bucketId ? bucketName.get(t.bucketId) ?? null : null,
        areaName: t.areaId ? areaName.get(t.areaId) ?? null : null,
      }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const projectItems = projects
      .filter(
        (p) =>
          (p.startDate && isoDate(p.startDate.toDate()) === selectedDate) ||
          (p.endDate && isoDate(p.endDate.toDate()) === selectedDate)
      )
      .map((p) => {
        // A project's end date is its milestone (screen1's "Milestone: ..."
        // agenda row) — its start date is a plainer "starts" entry. The
        // label says what the milestone actually is (project name shown
        // above it, this describes what's happening to it), not just the
        // word "Milestone" on its own.
        const isMilestone = !(p.startDate && isoDate(p.startDate.toDate()) === selectedDate);
        return {
          kind: 'project' as const,
          id: p.id,
          title: p.name,
          emoji: p.emoji ?? null,
          label: isMilestone ? 'Project ends' : 'Project starts',
          isMilestone,
        };
      });
    const paymentItems = payments.filter((payment) => payment.dueDate === selectedDate);
    return { taskItems, projectItems, paymentItems };
  }, [tasks, projects, payments, selectedDate, projectName, bucketName, areaName]);

  // For HeroUI Calendar's onFocusChange (arrow-key/nav-button navigation) —
  // accepts whatever month react-aria's own focus state landed on directly.
  function goToMonth(date: Date) {
    setMonthCursor(new Date(date.getFullYear(), date.getMonth(), 1));
  }
  function selectDay(dateIso: string) {
    setSelectedDate(dateIso);
  }
  function openProject(projectId: string) {
    router.push(`/projects/${projectId}`);
  }
  function openPayment() {
    router.push('/payments');
  }

  return {
    monthCursor,
    goToMonth,
    daysWithItems,
    selectedDate,
    selectDay,
    agenda,
    todayIso: isoDate(today),
    openProject,
    openPayment,
    loading: tasksLoading || projectsLoading || paymentsLoading || accountsLoading || categoriesLoading || ctxLoading,
  };
}
