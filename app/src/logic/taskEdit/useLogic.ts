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
import { query, setDoc, arrayUnion, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { projectsRef, taskRef, taskTypesRef } from '@/src/shared/firestore/refs';
import { createTask, updateTask, archiveTask, toDateOnly, toTimeOnly, combineDateAndTime } from '@/src/shared/firestore/taskWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY, TASK_TYPES, isValidCustomTaskType } from '@/src/viewmodels/projects';
import type { FirestoreProject, FirestoreTask, FirestoreTaskTypesSettings, TaskType, Priority } from '@/src/shared/firestore/types';

// Read directly off window.location.search (not useSearchParams()) so this
// screen never needs a Suspense boundary — same precedent as
// src/logic/addTransaction/useLogic.ts's retroTargetFromSearch.
function projectIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('projectId') ?? '';
}

// The main form vs. the Details sub-page (priority + task type) — a local
// view toggle within this one screen rather than a real route change, so
// every field already typed in stays right where it was (see
// Design/Newtask 4.PNG's own "Details" page, reached from "New Reminder").
export type TaskEditView = 'form' | 'details';

export function useLogic(taskId: string | null) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const isEditing = Boolean(taskId);

  const taskDocRef = useMemo(() => (uid && taskId ? taskRef(uid, taskId) : null), [uid, taskId]);
  const { data: existingTask, loading: taskLoading, error: taskError } = useFirestoreDoc<FirestoreTask>(taskDocRef);

  const projectsQuery = useMemo(() => (uid ? query(projectsRef(uid), where('status', '!=', 'Archived')) : null), [uid]);
  const { data: projects, loading: projectsLoading } = useFirestoreCollection<FirestoreProject>(projectsQuery);

  const taskTypesDocRef = useMemo(() => (uid ? taskTypesRef(uid) : null), [uid]);
  const { data: taskTypesDoc, loading: taskTypesLoading } = useFirestoreDoc<FirestoreTaskTypesSettings>(taskTypesDocRef);
  // Built-ins first, then any custom ones a household added — deduped in
  // case a custom name happens to match a built-in.
  const taskTypeOptions = useMemo(() => {
    const custom = (taskTypesDoc?.names ?? []).filter((name) => !TASK_TYPES.includes(name));
    return [...TASK_TYPES, ...custom];
  }, [taskTypesDoc]);

  const [view, setView] = useState<TaskEditView>('form');
  function openDetails() {
    setView('details');
  }
  function closeDetails() {
    setView('form');
  }

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
  const [newTaskTypeError, setNewTaskTypeError] = useState<string | null>(null);

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

  const isValid = Boolean(title.trim() && date && startTimeOfDay && endTimeOfDay);

  async function handleSave() {
    if (!uid || saving || !isValid) return;
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
        bucketId: project?.bucketId ?? null,
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

  // Adds a household-wide custom type (settings/taskTypes) and switches
  // this task to it — one capitalized word, same rule for every entry
  // point (isValidCustomTaskType), so nothing downstream (the Calendar
  // agenda, TaskCard) ever has to worry about a type string that isn't
  // display-ready as-is.
  async function addCustomTaskType(name: string) {
    const trimmed = name.trim();
    if (!uid || !trimmed) return;
    if (!isValidCustomTaskType(trimmed)) {
      setNewTaskTypeError('One capitalized word — e.g. "Errand".');
      return;
    }
    setNewTaskTypeError(null);
    await setDoc(taskTypesRef(uid), { names: arrayUnion(trimmed) }, { merge: true });
    setType(trimmed);
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
    view,
    openDetails,
    closeDetails,
    taskTypeOptions,
    newTaskTypeError,
    addCustomTaskType,
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
    isValid,
    saving,
    saveError,
    handleSave,
    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    goBack,
    loading: (isEditing && taskLoading) || projectsLoading || taskTypesLoading,
    error: taskError,
  };
}
