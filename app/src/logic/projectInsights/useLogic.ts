'use client';

// One project's Insights: its risk, velocity, forecast finish and slack, the
// burndown (remaining tasks, the ideal line and the forecast), and its
// milestones — which are added, edited and ticked off here (stored on the
// project doc, FirestoreProject.milestones).

import { useState } from 'react';
import { Timestamp, serverTimestamp, updateDoc } from 'firebase/firestore';
import { projectRef } from '@/src/shared/firestore/refs';
import { useInsightsSources } from '@/src/shared/insights/useInsightsData';
import { tasksByProject, toInsightProject } from '@/src/shared/insights/adapter';
import { burndown, projectStat } from '@/src/viewmodels/insights/metrics';
import { dayKey, parseDayKey } from '@/src/viewmodels/insights/dates';
import type { ProjectMilestone } from '@/src/shared/firestore/types';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export interface MilestoneDraft {
  id: string | null;
  name: string;
  due: string; // YYYY-MM-DD
  taskIds: string[];
  status: 'pending' | 'done';
}

export function useLogic(projectId: string) {
  const sources = useInsightsSources();
  const projectDoc = sources.projectDocs.find((p) => p.id === projectId) ?? null;

  const now = new Date(sources.minute * 60000);
  const tasks = sources.minute ? (tasksByProject(sources.taskDocs, now).get(projectId) ?? []) : [];
  const stat = projectDoc && sources.minute ? projectStat(toInsightProject(projectDoc), tasks, now, sources.settings.thresholds) : null;
  const points = stat ? burndown(stat, tasks, now) : [];

  // ---- Milestones ----
  const [draft, setDraft] = useState<MilestoneDraft | null>(null);
  const [saving, setSaving] = useState(false);
  function newMilestone() {
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setDraft({ id: null, name: '', due: dayKey(due), taskIds: [], status: 'pending' });
  }
  function editMilestone(id: string) {
    const m = projectDoc?.milestones?.find((x) => x.id === id);
    if (m) setDraft({ id: m.id, name: m.name, due: dayKey(m.dueDate.toDate()), taskIds: m.taskIds ?? [], status: m.status });
  }
  async function writeMilestones(next: ProjectMilestone[]) {
    if (!sources.uid || !projectDoc) return;
    await updateDoc(projectRef(sources.uid, projectDoc.id), { milestones: next, updatedAt: serverTimestamp() });
  }
  async function saveDraft() {
    if (!draft || !draft.name.trim() || !draft.due || saving) return;
    setSaving(true);
    try {
      const milestone: ProjectMilestone = {
        id: draft.id ?? crypto.randomUUID(),
        name: draft.name.trim(),
        dueDate: Timestamp.fromDate(parseDayKey(draft.due)),
        taskIds: draft.taskIds,
        status: draft.status,
      };
      const list = projectDoc?.milestones ?? [];
      const next = draft.id ? list.map((m) => (m.id === draft.id ? milestone : m)) : [...list, milestone];
      await writeMilestones(next.sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis()));
      setDraft(null);
    } finally {
      setSaving(false);
    }
  }
  async function deleteDraft() {
    if (!draft?.id) return;
    await writeMilestones((projectDoc?.milestones ?? []).filter((m) => m.id !== draft.id));
    setDraft(null);
  }

  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/projects/insights');
  }

  return {
    project: projectDoc,
    stat,
    points,
    tasks,
    draft,
    setDraft,
    newMilestone,
    editMilestone,
    saveDraft,
    deleteDraft,
    saving,
    goBack,
    loading: sources.loading,
  };
}
