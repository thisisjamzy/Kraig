'use client';

// One screen for both creating and editing a task (src/screens/TaskEdit) —
// unifies what used to be scattered per-screen "add task" sheets on
// ProjectDetail/AreaDetail into a single flow reachable from ProjectDetail,
// the Projects-mode FAB (standalone), Focus, Calendar, and Analytics alike,
// per "everything should be editable."
//
// Tasks are day-bound — one date, plus a start and an end time of day on
// that same date, never spanning into a second day — so this holds a plain
// date string and two time-of-day strings (not two independent
// datetime-locals that could drift onto different days) and combines them
// into the startTime/dueDate Timestamps taskWrites.ts actually wants right
// before saving.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { projectsRef, taskRef } from '@/src/shared/firestore/refs';
import { createTask, updateTask, archiveTask, toDateOnly, toTimeOnly, combineDateAndTime } from '@/src/shared/firestore/taskWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreProject, FirestoreTask, TaskType, Priority } from '@/src/shared/firestore/types';

// Read directly off window.location.search (not useSearchParams()) so this
// screen never needs a Suspense boundary — same precedent as
// src/logic/addTransaction/useLogic.ts's retroTargetFromSearch.
function projectIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('projectId') ?? '';
}

export function useLogic(taskId: string | null) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const isEditing = Boolean(taskId);

  const taskDocRef = useMemo(() => (uid && taskId ? taskRef(uid, taskId) : null), [uid, taskId]);
  const { data: existingTask, loading: taskLoading, error: taskError } = useFirestoreDoc<FirestoreTask>(taskDocRef);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid), where('status', '!=', 'Archived')) : null), [uid]);
  const { data: projects, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [type, setType] = useState<TaskType>('ToDo');
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [projectId, setProjectId] = useState<string>(projectIdFromSearch);
  const [done, setDone] = useState(false);
  const [date, setDate] = useState('');
  const [startTimeOfDay, setStartTimeOfDay] = useState('');
  const [endTimeOfDay, setEndTimeOfDay] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed once — from the existing task in edit mode (fired once its data
  // arrives), or immediately for a fresh create (nothing to wait for).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded) return;
    if (isEditing) {
      if (!existingTask) return;
      setTitle(existingTask.title);
      setEmoji(existingTask.emoji ?? null);
      setType(existingTask.type ?? 'ToDo');
      setPriority(existingTask.priority ?? DEFAULT_PRIORITY);
      setProjectId(existingTask.projectId ?? '');
      setDone(existingTask.done ?? false);
      // The date comes from whichever of start/due this task already has —
      // a legacy task (written before both were required) may only have one.
      const anchor = existingTask.startTime ?? existingTask.dueDate;
      setDate(anchor ? toDateOnly(anchor.toDate()) : '');
      setStartTimeOfDay(existingTask.startTime ? toTimeOnly(existingTask.startTime.toDate()) : '');
      setEndTimeOfDay(existingTask.dueDate ? toTimeOnly(existingTask.dueDate.toDate()) : '');
      setNotes(existingTask.notes ?? '');
      setSeeded(true);
    } else {
      setSeeded(true);
    }
  }, [isEditing, existingTask, seeded]);

  async function handleSave() {
    if (!uid || saving || !title.trim() || !date || !startTimeOfDay || !endTimeOfDay) return;
    setSaveError(null);
    const start = combineDateAndTime(date, startTimeOfDay);
    const due = combineDateAndTime(date, endTimeOfDay);
    if (due <= start) {
      setSaveError('End time must be after start time.');
      return;
    }
    setSaving(true);
    try {
      const project = projects.find((p) => p.id === projectId) ?? null;
      const input = {
        title: title.trim(),
        emoji,
        type,
        priority,
        projectId: project?.id ?? null,
        areaId: project?.areaId ?? null,
        startTime: start,
        dueDate: due,
        notes: notes.trim(),
      };
      if (isEditing && taskId) {
        await updateTask(uid, taskId, { ...input, done });
        router.back();
      } else {
        await createTask(uid, { ...input, createdBy: uid });
        if (project) router.push(`/projects/${project.id}`);
        else router.push('/projects/focus');
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this task.');
    } finally {
      setSaving(false);
    }
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  function openDeleteConfirm() {
    setDeleteConfirmOpen(true);
  }
  function cancelDelete() {
    setDeleteConfirmOpen(false);
  }
  async function confirmDelete() {
    if (!uid || !taskId) return;
    await archiveTask(uid, taskId);
    setDeleteConfirmOpen(false);
    router.back();
  }

  function goBack() {
    router.back();
  }

  return {
    isEditing,
    projects,
    title,
    setTitle,
    emoji,
    setEmoji,
    type,
    setType,
    priority,
    setPriority,
    projectId,
    setProjectId,
    done,
    setDone,
    date,
    setDate,
    startTimeOfDay,
    setStartTimeOfDay,
    endTimeOfDay,
    setEndTimeOfDay,
    notes,
    setNotes,
    saving,
    saveError,
    handleSave,
    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    goBack,
    loading: (isEditing && taskLoading) || projectsLoading,
    error: taskError,
  };
}
