'use client';

// New / edit project — one form for both (same as New / edit task).
// `projectId` switches it to editing: the fields are seeded from the
// project, Save updates it, and the extras appear (status, which includes
// archiving, and deleting the project for good).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDoc, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreDoc } from '@/src/shared/firestore/hooks';
import { useSections } from '@/src/shared/firestore/queries';
import { areasRef, projectRef, tasksRef } from '@/src/shared/firestore/refs';
import { ensureDefaultSection, defaultSectionId } from '@/src/shared/firestore/sections';
import { deleteProject } from '@/src/shared/firestore/projectWrites';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROJECT_COLORS, DEFAULT_PRIORITY } from '@/src/viewmodels/projects';
import type { FirestoreArea, FirestoreProject, FirestoreTask, Priority, ProjectStatus } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { showToast } from '@/src/widgets/Toast/Toast';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Same window.location.search read as src/logic/taskEdit/useLogic.ts's
// projectIdFromSearch — no Suspense boundary needed. Create only.
function fromSearch(key: 'areaId' | 'bucketId'): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

export function useLogic(projectId?: string) {
  const isEditing = Boolean(projectId);
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;

  const projectDocRef = useMemo(() => (uid && projectId ? projectRef(uid, projectId) : null), [uid, projectId]);
  const { data: project, loading: projectLoading, error: projectError } = useFirestoreDoc<FirestoreProject>(projectDocRef);

  const areasQuery = useMemo(() => (uid ? query(areasRef(uid), where('archived', '==', false)) : null), [uid]);
  const { data: areas, loading: areasLoading } = useFirestoreCollection<FirestoreArea>(areasQuery);

  // Editing: how many tasks the project has — the delete sheet asks what
  // to do with them.
  const tasksQuery = useMemo(
    () => (uid && projectId ? query(tasksRef(uid), where('projectId', '==', projectId)) : null),
    [uid, projectId]
  );
  const { data: projectTasks } = useFirestoreCollection<FirestoreTask>(tasksQuery);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string>(() => (isEditing ? '' : fromSearch('areaId')));
  const [bucketId, setBucketId] = useState<string>(() => (isEditing ? '' : fromSearch('bucketId')));
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [startDate, setStartDate] = useState(() => (isEditing ? '' : todayIso()));
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isValid = Boolean(name.trim() && description.trim());

  // Editing: seed the fields once the project has loaded.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seeded = !isEditing || seededFor === projectId;
  useEffect(() => {
    if (!project || !projectId || seededFor === projectId) return;
    setSeededFor(projectId);
    setName(project.name);
    setEmoji(project.emoji ?? null);
    setAreaId(project.areaId ?? '');
    setBucketId(project.bucketId ?? '');
    setColor(project.color);
    setPriority(project.priority ?? DEFAULT_PRIORITY);
    setStartDate(project.startDate ? toIso(project.startDate.toDate()) : '');
    setEndDate(project.endDate ? toIso(project.endDate.toDate()) : '');
    setStatus(project.status);
    setDescription(project.description ?? '');
  }, [project, seededFor, projectId]);

  // Every section in the chosen area — always includes that area's own
  // default section (sections.ts).
  const { data: sections } = useSections(areaId || undefined);

  // Keep the section valid for the chosen area: switching areas (or a
  // legacy null bucketId) resolves to that area's default, and guarantees
  // that default exists — this form may be the first place an area is
  // touched.
  useEffect(() => {
    if (!seeded) return;
    if (!areaId) {
      setBucketId('');
      return;
    }
    if (uid) ensureDefaultSection(uid, areaId, color);
    setBucketId((current) => (sections.some((b) => b.id === current) ? current : defaultSectionId(areaId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `color` intentionally excluded: it's only the fallback for a brand-new default section's own swatch, not something that should re-run this on every color pick.
  }, [areaId, sections, uid, seeded]);

  async function handleSave() {
    if (!uid || saving || !isValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      // A project's section only makes sense alongside its area — resolve
      // (and lazily create) the area's default section right before writing.
      const resolvedBucketId = areaId ? bucketId || (await ensureDefaultSection(uid, areaId, color)) : null;
      const newEndDate = endDate ? new Date(`${endDate}T00:00:00`) : null;
      const fields = {
        name: name.trim(),
        emoji,
        areaId: areaId || null,
        bucketId: resolvedBucketId,
        color,
        priority,
        startDate: startDate ? Timestamp.fromDate(new Date(`${startDate}T00:00:00`)) : null,
        endDate: newEndDate ? Timestamp.fromDate(newEndDate) : null,
        description: description.trim(),
        updatedAt: serverTimestamp(),
      };

      if (!projectId) {
        const id = crypto.randomUUID();
        await setDoc(projectRef(uid, id), {
          ...fields,
          originalEndDate: fields.endDate,
          rescheduleCount: 0,
          status: 'Active',
          createdAt: serverTimestamp(),
        });
        router.push(`/projects/${id}`);
        return;
      }

      // Same reschedule-flag bookkeeping as taskWrites.ts's updateTask:
      // originalEndDate is set once, rescheduleCount increments on every
      // later change — read fresh, since `project` may be stale by now.
      const before = (await getDoc(projectRef(uid, projectId))).data();
      const beforeEndMs = before?.endDate ? before.endDate.toMillis() : null;
      const newEndMs = newEndDate ? newEndDate.getTime() : null;
      const update: Record<string, unknown> = { ...fields, status };
      if (!before?.originalEndDate && newEndDate) update.originalEndDate = Timestamp.fromDate(newEndDate);
      else if (newEndMs !== null && newEndMs !== beforeEndMs && beforeEndMs !== null) {
        update.rescheduleCount = (before?.rescheduleCount ?? 0) + 1;
      }
      await updateDoc(projectRef(uid, projectId), update);
      router.push(`/projects/${projectId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : isEditing ? 'Could not update this project.' : 'Could not create this project.');
      setSaving(false);
    }
  }

  /** Permanently deletes the project; its tasks are deleted or kept standalone. */
  async function handleDelete(deleteTasks: boolean) {
    if (!uid || !projectId || deleting) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await deleteProject(uid, projectId, { deleteTasks });
      showToast(deleteTasks ? 'Project and its tasks deleted.' : 'Project deleted. Its tasks were kept.');
      router.push('/projects');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not delete this project.');
      setDeleting(false);
    }
  }

  // Back to the page the user came from (skipping forms) — see
  // src/shared/navigation/useGoBack.ts for when the fallback is used.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack(projectId ? `/projects/${projectId}` : '/projects');
  }

  return {
    isEditing,
    project,
    areas,
    sections,
    name,
    setName,
    emoji,
    setEmoji,
    areaId,
    setAreaId,
    bucketId,
    setBucketId,
    color,
    setColor,
    priority,
    setPriority,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    status,
    setStatus,
    description,
    setDescription,
    isValid,
    saving,
    saveError,
    handleSave,
    taskCount: projectTasks.length,
    deleting,
    handleDelete,
    goBack,
    loading: areasLoading || (isEditing && (projectLoading || (Boolean(project) && !seeded))),
    notFound: isEditing && !projectLoading && !project,
    error: projectError,
  };
}
