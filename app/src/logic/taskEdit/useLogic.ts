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
//
// Recurring tasks (src/viewmodels/recurrence.ts, src/shared/tasks/): the
// Repeat card picks a rule. Editing one date of a series (taskId
// "seriesId@YYYY-MM-DD") asks what to change — this date, this and
// following, or all — except when only its done switch changed, which
// always applies to that date alone. Saving a series first checks every
// date in the next 12 months against the time-blocking rules; conflicting
// dates can be skipped (saved as deleted dates) or the time changed.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { query, setDoc, arrayUnion, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { projectsRef, taskRef, taskTypesRef } from '@/src/shared/firestore/refs';
import {
  createTask,
  updateTask,
  updateTaskDone,
  archiveTask,
  toDateOnly,
  toTimeOnly,
  combineDateAndTime,
} from '@/src/shared/firestore/taskWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { DEFAULT_PRIORITY, TASK_TYPES, isValidCustomTaskType } from '@/src/viewmodels/projects';
import { isQuadrant, priorityForQuadrant } from '@/src/viewmodels/eisenhower';
import {
  checkAvailability,
  checkOccurrences,
  defaultTimeMode,
  effectiveTimeMode,
  isInsideBlocked,
  type Availability,
  type OccurrenceCheck,
  type ScheduledTask,
  type Slot,
} from '@/src/viewmodels/scheduling';
import {
  addDays,
  dateKey,
  describeRule,
  expandRule,
  formatRRule,
  keyToDate,
  normalizeRRule,
  parseRRule,
  presetFor,
  presetForDate,
  presetOptions,
  presetRule,
  type RecurrenceRule,
  type RepeatPreset,
} from '@/src/viewmodels/recurrence';
import {
  describeSeries,
  expandTasks,
  isRecurring,
  occurrenceFor,
  occurrenceId,
  parseOccurrenceId,
  seriesStart,
} from '@/src/shared/tasks/recurringTasks';
import { planDelete, planEdit, type EditScope, type TaskForm } from '@/src/shared/tasks/recurringPlan';
import { runWrites } from '@/src/shared/tasks/recurringWrites';
import { useAllTasks } from '@/src/shared/hooks/useAllTasks';
import { useCalendarEvents } from '@/src/shared/hooks/useCalendarEvents';
import { googleEventsAsScheduled } from '@/src/shared/calendarSync/availability';
import { showToast } from '@/src/widgets/Toast/Toast';
import type {
  FirestoreProject,
  FirestoreTask,
  FirestoreTaskTypesSettings,
  TaskException,
  TaskType,
  Priority,
  Quadrant,
  TimeMode,
} from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

// Read directly off window.location.search (not useSearchParams()) so this
// screen never needs a Suspense boundary — same precedent as
// src/logic/addTransaction/useLogic.ts's retroTargetFromSearch.
function projectIdFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('projectId') ?? '';
}

// The Calendar's "Add Event" opens this form on its selected day as an
// Event (?date=YYYY-MM-DD&type=Event) — same no-Suspense read as above.
function dateFromSearch(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('date');
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
// The Focus board's column "+" opens this form with that quadrant
// preselected (?quadrant=do|schedule|delegate|eliminate).
function quadrantFromSearch(): Quadrant | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('quadrant');
  return isQuadrant(value) ? value : null;
}
function typeFromSearch(): TaskType | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('type');
  return value && TASK_TYPES.includes(value) ? value : null;
}

// The main form vs. the Details sub-page (priority + task type) — a local
// view toggle within this one screen rather than a real route change, so
// every field already typed in stays right where it was (see
// Design/Newtask 4.PNG's own "Details" page, reached from "New Reminder").
export type TaskEditView = 'form' | 'details';

function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// The next whole hour from now (never before 09:00), for an hour — clamped
// so it never runs past midnight.
function defaultTimes() {
  const hour = Math.min(22, Math.max(9, new Date().getHours() + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${pad(hour)}:00`, end: `${pad(hour + 1)}:00` };
}

/** How far ahead a series' dates are checked for conflicts. */
const CONFLICT_HORIZON_MONTHS = 12;

/** The fields whose change makes a save more than "tick this date done". */
function snapshotOf(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

function seriesIdOf(taskId: string): string {
  return parseOccurrenceId(taskId)?.seriesId ?? taskId;
}

/** Every task (recurring ones as their dates) from yesterday to
 * CONFLICT_HORIZON_MONTHS past the chosen date, as the scheduler sees them. */
function buildScheduledTasks(tasks: FirestoreTask[], date: string): ScheduledTask[] {
  const today = new Date();
  const from = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -1);
  const chosen = date ? keyToDate(date) : from;
  const base = chosen > from ? chosen : from;
  const to = new Date(base.getFullYear(), base.getMonth() + CONFLICT_HORIZON_MONTHS, base.getDate() + 1);
  return expandTasks(tasks, from, to).map((t) => ({
    id: t.id,
    seriesId: t.seriesId,
    title: t.title,
    start: t.startTime ? t.startTime.toDate() : null,
    end: t.dueDate ? t.dueDate.toDate() : null,
    mode: effectiveTimeMode(t),
    allDay: Boolean(t.allDay),
    status: t.status,
  }));
}

export interface ScopeSheet {
  action: 'save' | 'delete';
  options: EditScope[];
}
export interface ConflictSheet {
  conflicts: OccurrenceCheck[];
  total: number;
  /** What to do once the user chooses to skip the conflicting dates. */
  scope: EditScope | null;
}

export interface TaskEditOptions {
  /** Shown in the side panel (medium screens and up): leaving the form
   * closes the panel instead of navigating. Phones never pass this. */
  onDone?: () => void;
}

export function useLogic(taskId: string | null, { onDone }: TaskEditOptions = {}) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const isEditing = Boolean(taskId);
  // "seriesId@YYYY-MM-DD" opens one date of a recurring task.
  const parsedId = taskId ? parseOccurrenceId(taskId) : null;
  const docId = parsedId?.seriesId ?? taskId;

  const taskDocRef = useMemo(() => (uid && taskId ? taskRef(uid, seriesIdOf(taskId)) : null), [uid, taskId]);
  const { data: existingTask, loading: taskLoading, error: taskError } = useFirestoreDoc<FirestoreTask>(taskDocRef);
  // Editing a series: which date (the one opened, or its first when opened
  // by the series id), and that date as a task.
  const recurringEdit = Boolean(isEditing && existingTask && isRecurring(existingTask));
  const firstStart = existingTask ? seriesStart(existingTask) : null;
  const occurrenceKey = recurringEdit ? (parsedId?.key ?? (firstStart ? dateKey(firstStart) : null)) : null;
  const occurrence = recurringEdit && existingTask && occurrenceKey ? occurrenceFor(existingTask, occurrenceKey) : null;
  const seriesSummary = recurringEdit && existingTask ? describeSeries(existingTask) : null;

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
  const [type, setType] = useState<TaskType>(() => (taskId ? 'ToDo' : typeFromSearch() ?? 'ToDo'));
  // A quadrant preselected from the Focus board also sets a matching
  // importance (priority), same rule as dragging on the board.
  const [quadrant, setQuadrantState] = useState<Quadrant | null>(() => (taskId ? null : quadrantFromSearch()));
  const [priority, setPriority] = useState<Priority>(() => {
    const preset = taskId ? null : quadrantFromSearch();
    return preset ? priorityForQuadrant(DEFAULT_PRIORITY, preset) : DEFAULT_PRIORITY;
  });
  // null = automatic (derived from priority and date, eisenhower.ts).
  function setQuadrant(next: Quadrant | null) {
    setQuadrantState(next);
    if (next) setPriority((current) => priorityForQuadrant(current, next));
  }
  const [projectId, setProjectId] = useState<string>(projectIdFromSearch);
  const [done, setDone] = useState(false);
  // A new task defaults to today, starting at the next whole hour for an
  // hour (see defaultTimes) — only used once "set a time" is on.
  const [date, setDate] = useState(() => (taskId ? '' : dateFromSearch() ?? toDateOnly(new Date())));
  const [startTimeOfDay, setStartTimeOfDay] = useState(() => (taskId ? '' : defaultTimes().start));
  const [endTimeOfDay, setEndTimeOfDay] = useState(() => (taskId ? '' : defaultTimes().end));
  // Times are optional for a todo (the form's "set a time" toggle); a
  // meeting or event always has them. Off = a date-only task
  // (FirestoreTask.allDay).
  const [timeEnabled, setTimeEnabled] = useState(false);
  // Time blocking (src/viewmodels/scheduling.ts). null = follow the type's
  // default (meetings/events blocked, to-dos free) until the user picks.
  const [timeModeChoice, setTimeModeChoice] = useState<TimeMode | null>(null);
  const [notes, setNotes] = useState('');
  // Repeat: a preset (whose rule follows the date — "weekly on Tuesday"
  // becomes "weekly on Wednesday" when the date moves), or a custom rule.
  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>('none');
  const [customRule, setCustomRule] = useState<RecurrenceRule | null>(null);
  const [seedSnapshot, setSeedSnapshot] = useState<string | null>(null);
  const [seedDone, setSeedDone] = useState(false);
  const [scopeSheet, setScopeSheet] = useState<ScopeSheet | null>(null);
  const [conflictSheet, setConflictSheet] = useState<ConflictSheet | null>(null);
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
      // One date of a series is edited as that date (its own times, done
      // state and one-date changes).
      const source: FirestoreTask = occurrence ?? existingTask;
      setTitle(source.title);
      setEmoji(source.emoji ?? null);
      setType(source.type ?? 'ToDo');
      setPriority(source.priority ?? DEFAULT_PRIORITY);
      setQuadrantState(source.quadrant ?? null);
      setProjectId(source.projectId ?? '');
      setDone(source.done ?? false);
      setSeedDone(source.done ?? false);
      // The date comes from whichever of start/due this task already has —
      // a legacy task (written before both were required) may only have one.
      const anchor = source.startTime ?? source.dueDate;
      const seededDate = anchor ? toDateOnly(anchor.toDate()) : '';
      setDate(seededDate);
      let start = source.startTime ? toTimeOnly(source.startTime.toDate()) : '';
      let end = source.dueDate ? toTimeOnly(source.dueDate.toDate()) : '';
      setTimeEnabled(!source.allDay);
      setTimeModeChoice(source.timeMode ?? null);
      if (source.allDay) {
        const defaults = defaultTimes();
        start = defaults.start;
        end = defaults.end;
      }
      setStartTimeOfDay(start);
      setEndTimeOfDay(end);
      setNotes(source.notes ?? '');
      const rule = existingTask.rrule ? parseRRule(existingTask.rrule) : null;
      const preset = seededDate ? presetFor(rule, keyToDate(seededDate)) : 'none';
      setRepeatPreset(preset);
      setCustomRule(preset === 'custom' ? rule : null);
      setSeedSnapshot(
        snapshotOf({
          title: source.title,
          type: source.type ?? 'ToDo',
          priority: source.priority ?? DEFAULT_PRIORITY,
          quadrant: source.quadrant ?? null,
          projectId: source.projectId ?? '',
          date: seededDate,
          start: source.allDay ? null : start,
          end: source.allDay ? null : end,
          allDay: Boolean(source.allDay),
          timeMode: source.timeMode ?? null,
          notes: source.notes ?? '',
          rrule: normalizeRRule(existingTask.rrule),
        })
      );
      setSeeded(true);
    } else {
      setSeeded(true);
    }
  }, [isEditing, existingTask, occurrence, seeded]);

  // Only a todo may skip times.
  const timesRequired = type !== 'ToDo';
  const usesTime = timesRequired || timeEnabled;
  const durationMinutes =
    startTimeOfDay && endTimeOfDay ? minutesOf(endTimeOfDay) - minutesOf(startTimeOfDay) : 0;
  const timeError = usesTime && startTimeOfDay && endTimeOfDay && durationMinutes <= 0 ? 'end time must be after start' : null;

  // ---- Repeat ----
  const dateValue = date ? keyToDate(date) : null;
  const activePreset: RepeatPreset = dateValue ? presetForDate(repeatPreset, dateValue) : 'none';
  const rule: RecurrenceRule | null =
    activePreset === 'custom' ? customRule : dateValue ? presetRule(activePreset, dateValue) : null;
  const rrule = rule ? formatRRule(rule) : null;
  const repeatOptions = dateValue ? presetOptions(dateValue) : [];
  const repeatLabel = rule && dateValue ? describeRule(rule, dateValue) : 'Does not repeat';
  // Changing the rule itself can't apply to one date alone.
  const ruleChanged = recurringEdit && normalizeRRule(existingTask?.rrule) !== rrule;
  function chooseRepeatPreset(preset: RepeatPreset) {
    setRepeatPreset(preset);
    if (preset !== 'custom') setCustomRule(null);
  }
  function applyCustomRule(next: RecurrenceRule) {
    setCustomRule(next);
    setRepeatPreset('custom');
  }
  // ---- Time blocking: live availability for the chosen window ----
  const { data: allTaskDocs } = useAllTasks();
  // Recurring tasks take part as their dates, over the window any check
  // can look at (a little before today to CONFLICT_HORIZON_MONTHS ahead of
  // the chosen date).
  // Google Calendar events (pulled mirrors, from yesterday on) count too:
  // one that blocks time in Google is a blocked window here, one marked
  // Free there is ignored — src/shared/calendarSync/availability.ts.
  const [googleFromMs] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  });
  const { data: googleDocs } = useCalendarEvents(googleFromMs, null);
  // (Memoized by the React Compiler on its inputs.)
  const scheduledTasks = [...buildScheduledTasks(allTaskDocs, date), ...googleEventsAsScheduled(googleDocs)];
  // Whatever this form is editing — a task, or every date of a series.
  const excludeId = isEditing ? docId : null;
  const timeMode: TimeMode = timeModeChoice ?? defaultTimeMode(type);
  const windowStart = usesTime && date && startTimeOfDay ? combineDateAndTime(date, startTimeOfDay) : null;
  const windowEnd = usesTime && date && endTimeOfDay ? combineDateAndTime(date, endTimeOfDay) : null;
  // One pass over the user's tasks — cheap enough to run every render (the
  // React Compiler memoizes it on its inputs).
  const availability: Availability | null =
    windowStart && windowEnd && windowEnd > windowStart
      ? checkAvailability(windowStart, windowEnd, timeMode, excludeId, scheduledTasks)
      : null;
  // Which time to flag red on a conflict: the start when it sits inside an
  // overlapping task, otherwise the end.
  const conflictField: 'start' | 'end' | null =
    availability?.status === 'conflict' && windowStart
      ? availability.overlappingTasks.some((t) => t.start! <= windowStart && windowStart < t.end!)
        ? 'start'
        : 'end'
      : null;
  // An edit that leaves the task's window and mode exactly as stored is
  // never blocked — two tasks that overlapped before time blocking existed
  // can still be renamed or re-prioritised. Any real change is checked.
  const editedSource = occurrence ?? existingTask;
  const unchangedSchedule = Boolean(
    isEditing &&
      editedSource &&
      windowStart &&
      windowEnd &&
      editedSource.startTime?.toMillis() === windowStart.getTime() &&
      editedSource.dueDate?.toMillis() === windowEnd.getTime() &&
      effectiveTimeMode(editedSource) === timeMode &&
      !ruleChanged
  );
  // A repeating task isn't blocked here — saving lists every clashing date
  // and offers to skip them (the conflict sheet).
  const blockedByConflict = availability?.status === 'conflict' && !unchangedSchedule && !rule;

  // ---- Every date of the series, for the conflict check ----
  const seriesChecks: OccurrenceCheck[] = (() => {
    if (!rule || !windowStart || !windowEnd || windowEnd <= windowStart) return [];
    const horizon = new Date(
      windowStart.getFullYear(),
      windowStart.getMonth() + CONFLICT_HORIZON_MONTHS,
      windowStart.getDate(),
      23,
      59
    );
    const length = windowEnd.getTime() - windowStart.getTime();
    const windows = expandRule(rule, windowStart, horizon).map((start) => ({
      start,
      end: new Date(start.getTime() + length),
    }));
    return checkOccurrences(windows, timeMode, excludeId, scheduledTasks);
  })();
  const seriesConflicts = seriesChecks.filter((c) => c.status === 'conflict');
  // "First date is free, 3 later dates conflict"
  const laterConflictCount = seriesChecks.slice(1).filter((c) => c.status === 'conflict').length;
  const seriesNote =
    laterConflictCount > 0
      ? `${seriesChecks[0]?.status === 'conflict' ? 'First date conflicts' : 'First date is free'}, ${laterConflictCount} later ${laterConflictCount === 1 ? 'date conflicts' : 'dates conflict'}`
      : null;
  // A new blocked series over free tasks: those dates become free (rule 3).
  const sharedDateCount = seriesChecks.filter((c) => c.forcedMode === 'free').length;

  function applySlot(slot: Slot) {
    const pad = (n: number) => String(n).padStart(2, '0');
    setStartTimeOfDay(`${pad(slot.start.getHours())}:${pad(slot.start.getMinutes())}`);
    setEndTimeOfDay(`${pad(slot.end.getHours())}:${pad(slot.end.getMinutes())}`);
  }
  function tryTomorrow() {
    if (!date) return;
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    setDate(toDateOnly(next));
  }
  /** For the time wheels: is HH:mm on the chosen date inside a blocked task? */
  function isLockedTime(time: string) {
    if (!date) return false;
    return isInsideBlocked(combineDateAndTime(date, time), scheduledTasks, excludeId);
  }

  const isValid = Boolean(
    title.trim() && date && (!usesTime || (startTimeOfDay && endTimeOfDay && !timeError && !blockedByConflict))
  );

  function buildForm(): TaskForm | null {
    // A date-only task still spans its whole day (see FirestoreTask.allDay).
    const start = usesTime ? combineDateAndTime(date, startTimeOfDay) : combineDateAndTime(date, '00:00');
    const due = usesTime ? combineDateAndTime(date, endTimeOfDay) : combineDateAndTime(date, '23:59');
    if (due <= start) {
      setSaveError('End time must be after start time.');
      return null;
    }
    const project = projects.find((p) => p.id === projectId) ?? null;
    return {
      title: title.trim(),
      emoji,
      type,
      priority,
      projectId: project?.id ?? null,
      areaId: project?.areaId ?? null,
      bucketId: project?.bucketId ?? null,
      startTime: start,
      dueDate: due,
      allDay: !usesTime,
      quadrant,
      // A repeating task keeps the mode chosen (dates sharing time with
      // free tasks get their own 'free'); a one-off one is saved as what
      // the check resolved to — a forced switch to free included.
      timeMode: usesTime ? (rule ? timeMode : (availability?.effectiveMode ?? timeMode)) : undefined,
      notes: notes.trim(),
      done,
      rrule,
    };
  }

  const currentSnapshot = snapshotOf({
    title: title.trim(),
    type,
    priority,
    quadrant,
    projectId,
    date,
    start: usesTime ? startTimeOfDay : null,
    end: usesTime ? endTimeOfDay : null,
    allDay: !usesTime,
    timeMode: timeModeChoice,
    notes: notes.trim(),
    rrule,
  });

  /** Per-date exceptions a series is saved with: skipped conflicting dates,
   * and (new series only) dates switched to free. */
  function seriesExtras(skipConflicts: boolean): Record<string, TaskException> {
    const extra: Record<string, TaskException> = {};
    for (const check of seriesChecks) {
      const key = dateKey(check.start);
      if (skipConflicts && check.status === 'conflict') extra[key] = { deleted: true };
      else if (check.forcedMode === 'free' && timeMode === 'blocked') extra[key] = { timeMode: 'free' };
    }
    return extra;
  }

  function finish(created: boolean) {
    if (onDone) {
      onDone();
      return;
    }
    if (created) {
      // Back to the Time home screen, where today's list picks it up.
      router.push('/projects');
    } else {
      router.back();
    }
  }

  async function runSave(scope: EditScope | null, skipConflicts: boolean) {
    if (!uid) return;
    const form = buildForm();
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const extra = rule ? seriesExtras(skipConflicts) : {};
      if (!isEditing) {
        const { done: _done, rrule: newRule, ...rest } = form;
        void _done;
        await createTask(uid, { ...rest, createdBy: uid, rrule: newRule, exceptions: newRule ? extra : undefined });
        if (usesTime && !newRule && availability?.status === 'shared') {
          const n = availability.overlappingTasks.length;
          showToast(`Added as free, sharing time with ${n} ${n === 1 ? 'task' : 'tasks'}`);
        } else if (newRule && sharedDateCount > 0) {
          showToast(`${sharedDateCount} ${sharedDateCount === 1 ? 'date' : 'dates'} added as free, sharing time`);
        }
        finish(true);
      } else if (recurringEdit && existingTask && occurrenceKey && scope) {
        await runWrites(uid, planEdit(existingTask, occurrenceKey, scope, form, extra));
        finish(false);
      } else if (docId) {
        // A one-off task — possibly turned into a series here.
        const { done: isDone, rrule: newRule, ...rest } = form;
        await updateTask(uid, docId, {
          ...rest,
          done: newRule ? false : isDone,
          ...(newRule ? { rrule: newRule, exceptions: extra } : {}),
        });
        finish(false);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this task.');
    } finally {
      setSaving(false);
    }
  }

  /** Saves, unless some of the series' dates clash — then asks first. */
  function saveChecked(scope: EditScope | null) {
    if (rule && usesTime && seriesConflicts.length > 0) {
      setConflictSheet({ conflicts: seriesConflicts, total: seriesChecks.length, scope });
      return;
    }
    runSave(scope, false);
  }

  async function handleSave() {
    if (!uid || saving || !isValid) return;
    setSaveError(null);
    if (!recurringEdit) {
      saveChecked(null);
      return;
    }
    // Only the done switch changed: that date alone, no questions.
    if (currentSnapshot === seedSnapshot) {
      if (done !== seedDone && taskId && occurrenceKey && docId) {
        setSaving(true);
        try {
          await updateTaskDone(uid, occurrenceId(docId, occurrenceKey), done);
        } finally {
          setSaving(false);
        }
      }
      finish(false);
      return;
    }
    setScopeSheet({ action: 'save', options: ruleChanged ? ['following', 'all'] : ['this', 'following', 'all'] });
  }

  async function chooseScope(scope: EditScope) {
    const sheet = scopeSheet;
    setScopeSheet(null);
    if (!sheet || !uid || !existingTask || !occurrenceKey) return;
    if (sheet.action === 'delete') {
      await runWrites(uid, planDelete(existingTask, occurrenceKey, scope));
      if (onDone) onDone();
      else router.back();
      return;
    }
    if (scope === 'this') {
      // One date: the same single-window rule as a one-off task.
      if (availability?.status === 'conflict' && !unchangedSchedule) {
        const first = availability.overlappingTasks[0];
        setSaveError(`This time conflicts with “${first?.title ?? 'another task'}”. Pick another time.`);
        return;
      }
      runSave('this', false);
      return;
    }
    saveChecked(scope);
  }
  function closeScopeSheet() {
    setScopeSheet(null);
  }

  function skipConflictingDates() {
    const sheet = conflictSheet;
    setConflictSheet(null);
    if (sheet) runSave(sheet.scope, true);
  }
  function changeTime() {
    setConflictSheet(null);
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
    // A date of a series: which dates to delete.
    if (recurringEdit) setScopeSheet({ action: 'delete', options: ['this', 'following', 'all'] });
    else setDeleteConfirmOpen(true);
  }
  function cancelDelete() {
    setDeleteConfirmOpen(false);
  }
  async function confirmDelete() {
    if (!uid || !taskId) return;
    await archiveTask(uid, docId ?? taskId);
    setDeleteConfirmOpen(false);
    if (onDone) onDone();
    else router.back();
  }

  // Closing the form returns to the page it was opened from (never another
  // form) — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    if (onDone) onDone();
    else navigateBack('/projects');
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
    quadrant,
    setQuadrant,
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
    timeEnabled,
    setTimeEnabled,
    timeMode,
    setTimeMode: setTimeModeChoice,
    availability,
    conflictField,
    unchangedSchedule,
    applySlot,
    tryTomorrow,
    isLockedTime,
    repeatPreset: activePreset,
    repeatOptions,
    repeatLabel,
    rule,
    chooseRepeatPreset,
    applyCustomRule,
    seriesNote,
    sharedDateCount,
    seriesSummary,
    recurringEdit,
    scopeSheet,
    chooseScope,
    closeScopeSheet,
    conflictSheet,
    skipConflictingDates,
    changeTime,
    timesRequired,
    usesTime,
    durationMinutes,
    timeError,
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
