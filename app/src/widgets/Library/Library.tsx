'use client';

// Library, the page body: Resources, and the Archive in its own tab
// (/library?tab=archive), filtered by kind. Each archived project, folder,
// area, task or person has Restore and, where it can be deleted, Delete for
// good behind a type-the-name confirmation. Web and phone wrap it.

import { useState } from 'react';
import Link from 'next/link';
import { Archive, FileText } from 'lucide-react';
import { useLogic, type ArchivedItem } from '@/src/logic/library/useLogic';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import s from './Library.module.css';

type Tab = 'resources' | 'archive';
const KINDS: (ArchivedItem['kind'] | 'All')[] = ['All', 'Project', 'Folder', 'Area', 'Task', 'Person'];
const PLURAL: Record<string, string> = { All: 'All', Project: 'Projects', Folder: 'Folders', Area: 'Areas', Task: 'Tasks', Person: 'People' };
const DELETE_NOTE: Record<string, string> = {
  Project: 'This deletes the project and every task in it.',
  Folder: 'This deletes the folder. Its projects and tasks move to the area’s default folder.',
  Area: 'This deletes the area and its folders. Its projects and tasks are kept, with no area.',
};

function tabFromUrl(): Tab {
  if (typeof window === 'undefined') return 'resources';
  return new URLSearchParams(window.location.search).get('tab') === 'archive' ? 'archive' : 'resources';
}

/** Library: Resources, and the Archive in a tab of its own (?tab=archive),
 * filtered by kind. */
export function LibraryBody() {
  const v = useLogic();
  const [tab, setTabState] = useState<Tab>(tabFromUrl);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('All');
  const [deleting, setDeleting] = useState<ArchivedItem | null>(null);
  const setTab = (t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === 'archive') url.searchParams.set('tab', 'archive');
    else url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url);
  };
  const shown = kind === 'All' ? v.archive : v.archive.filter((i) => i.kind === kind);
  return (
    <div className={s.body}>
      <div className={s.tabs} role="tablist" aria-label="Library">
        <button type="button" role="tab" aria-selected={tab === 'resources'} onClick={() => setTab('resources')}>
          <FileText size={16} aria-hidden /> Resources
        </button>
        <button type="button" role="tab" aria-selected={tab === 'archive'} onClick={() => setTab('archive')}>
          <Archive size={16} aria-hidden /> Archive <span className={s.tabCount}>{v.archive.length}</span>
        </button>
      </div>

      {tab === 'resources' ? (
        <section className={s.card} aria-label="Resources">
          <div className={s.emptyRow}>
            <FileText size={18} strokeWidth={1.75} aria-hidden />
            <p>
              Resources will hold notes, files and links for your areas, folders and projects. Until then, keep them in a project&apos;s notes on its page, under <Link href="/projects/all">Projects</Link>.
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className={s.kinds} role="radiogroup" aria-label="Show">
            {KINDS.map((k) => {
              const n = k === 'All' ? v.archive.length : v.archive.filter((i) => i.kind === k).length;
              return (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                  {PLURAL[k]} <span>{n}</span>
                </button>
              );
            })}
          </div>
          <p className={s.overline}>Archiving never deletes anything. Restore puts it back where it was.</p>
          <ScreenState loading={v.loading} />
          {!v.loading && (
            <section className={s.card} aria-label="Archive">
              {shown.length ? (
                shown.map((item) => (
                  <div key={item.key} className={s.row}>
                    <span className={s.who}>
                      <span className={s.name}>{item.name}</span>
                      <span className={s.meta}>{[item.kind, item.meta].filter(Boolean).join(' · ')}</span>
                    </span>
                    <button
                      type="button"
                      className={s.restore}
                      onClick={async () => {
                        await item.restore();
                        showToast(`${item.name} is back`);
                      }}
                    >
                      Restore
                    </button>
                    {item.remove ? (
                      <button type="button" className={s.delete} onClick={() => setDeleting(item)}>
                        Delete for good
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))
              ) : (
                <p className={s.emptyText}>{kind === 'All' ? 'Nothing archived. When you archive a project, folder, area, task or person, it waits here.' : `No archived ${PLURAL[kind].toLowerCase()}.`}</p>
              )}
            </section>
          )}
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name} for good?`}
          message={`${DELETE_NOTE[deleting.kind] ?? ''} It cannot be undone. Restoring it instead keeps everything.`.trim()}
          typeToConfirm={deleting.name}
          confirmLabel="Delete for good"
          cancelLabel="Cancel"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const item = deleting;
            setDeleting(null);
            await item.remove?.();
            showToast(`${item.name} deleted`);
          }}
        />
      )}
    </div>
  );
}
