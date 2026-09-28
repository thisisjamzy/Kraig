'use client';

// One Google Calendar event, pulled by calendar sync
// (users/{uid}/calendarEvents/{googleEventId}) — a read-only mirror: title
// and time are Google's (edited in Google Calendar, never here). What the
// app owns and this page edits: a link to one task or project, and notes.
// A pull never overwrites those (src/shared/calendarSync/reconcile.ts).

import { useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { calendarEventRef, projectsRef } from '@/src/shared/firestore/refs';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { updateEventAppFields } from '@/src/shared/calendarSync/firestoreIO';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { FirestoreCalendarEvent, FirestoreProject } from '@/src/shared/firestore/types';

export interface LinkOption {
  kind: 'task' | 'project';
  id: string;
  name: string;
  color?: string;
}

export function useLogic(eventId: string) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const ref = useMemo(() => (uid ? calendarEventRef(uid, eventId) : null), [uid, eventId]);
  const { data: event, loading, error } = useFirestoreDoc<FirestoreCalendarEvent>(ref);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid), where('status', '!=', 'Archived')) : null), [uid]);
  const { data: projects } = useFirestoreCollection<FirestoreProject>(projectsQuery);
  const { data: tasks } = useAllTasks();

  const options: LinkOption[] = useMemo(
    () => [
      ...projects.map((p) => ({ kind: 'project' as const, id: p.id, name: p.name, color: p.color })),
      ...tasks.filter((t) => !t.done).map((t) => ({ kind: 'task' as const, id: t.id, name: t.title })),
    ],
    [projects, tasks]
  );
  const linked: LinkOption | null = useMemo(() => {
    if (!event) return null;
    if (event.linkedTaskId) {
      const t = tasks.find((x) => x.id === event.linkedTaskId);
      return { kind: 'task', id: event.linkedTaskId, name: t?.title ?? 'A deleted task' };
    }
    if (event.linkedProjectId) {
      const p = projects.find((x) => x.id === event.linkedProjectId);
      return { kind: 'project', id: event.linkedProjectId, name: p?.name ?? 'A deleted project', color: p?.color };
    }
    return null;
  }, [event, tasks, projects]);

  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const visibleOptions = options.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 60);

  // Notes: seeded once from the doc, saved when the field loses focus.
  const [notes, setNotes] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (event && seededFor !== event.id) {
    setSeededFor(event.id);
    setNotes(event.notes ?? '');
  }

  async function saveNotes() {
    if (!uid || !event || notes === (event.notes ?? '')) return;
    try {
      await updateEventAppFields(uid, event.googleEventId, { notes });
    } catch {
      showToast("Couldn't save your notes");
    }
  }

  async function linkTo(option: LinkOption | null) {
    setLinkSheetOpen(false);
    setSearch('');
    if (!uid || !event) return;
    try {
      await updateEventAppFields(uid, event.googleEventId, {
        linkedTaskId: option?.kind === 'task' ? option.id : null,
        linkedProjectId: option?.kind === 'project' ? option.id : null,
      });
    } catch {
      showToast("Couldn't save the link");
    }
  }

  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/projects/calendar');
  }

  return {
    event,
    loading,
    error,
    linked,
    linkSheetOpen,
    openLinkSheet: () => setLinkSheetOpen(true),
    closeLinkSheet: () => setLinkSheetOpen(false),
    search,
    setSearch,
    visibleOptions,
    linkTo,
    notes,
    setNotes,
    saveNotes,
    goBack,
  };
}
