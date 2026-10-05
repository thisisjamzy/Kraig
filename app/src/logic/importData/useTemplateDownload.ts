'use client';

// "Download template": the Time or Money template, its name dropdowns
// filled with the person's own areas, sections and projects (Time) or
// wallets, baskets and categories (Money). Used by the template chooser
// wherever templates are offered (src/widgets/TemplateChooser).

import { useMemo, useState } from 'react';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { accountsRef, areasRef, bucketsRef, categoriesRef, projectsRef, sectionsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { downloadTemplate } from '@/src/shared/import/buildTemplate';
import type { NameList, TemplateKind } from '@/src/shared/import/templates';
import type { FirestoreAccount, FirestoreArea, FirestoreBucket, FirestoreCategory, FirestoreProject, FirestoreSection } from '@/src/shared/firestore/types';

export function useTemplateDownload() {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const { data: areas } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid ? areasRef(uid) : null), [uid]));
  const { data: sections } = useFirestoreCollection<FirestoreSection>(useMemo(() => (uid ? sectionsRef(uid) : null), [uid]));
  const { data: projects } = useFirestoreCollection<FirestoreProject>(useMemo(() => (uid ? projectsRef(uid) : null), [uid]));
  const { data: accounts } = useFirestoreCollection<FirestoreAccount>(useMemo(() => (uid ? accountsRef(uid) : null), [uid]));
  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(useMemo(() => (uid ? bucketsRef(uid) : null), [uid]));
  const { data: categories } = useFirestoreCollection<FirestoreCategory>(useMemo(() => (uid ? categoriesRef(uid) : null), [uid]));
  const [busy, setBusy] = useState<TemplateKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TemplateKind | null>(null);

  function names(kind: TemplateKind): Partial<Record<NameList, string[]>> {
    const live = <T extends { archived?: boolean; name: string }>(xs: T[]) => xs.filter((x) => !x.archived).map((x) => x.name);
    if (kind === 'time') {
      return {
        areas: live(areas),
        sections: sections.filter((s) => !s.archived && !s.isDefault).map((s) => s.name),
        projects: projects.filter((p) => p.status !== 'Archived').map((p) => p.name),
      };
    }
    return { wallets: live(accounts), baskets: live(buckets), categories: live(categories) };
  }

  async function download(kind: TemplateKind) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await downloadTemplate(kind, names(kind));
      setDone(kind);
    } catch {
      setError('The template could not be made. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return { download, busy, error, done };
}

export type TemplateDownload = ReturnType<typeof useTemplateDownload>;
