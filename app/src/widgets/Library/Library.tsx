'use client';

// Library, the page body (Dreda.figcraft `Library / Web`): Resources, then
// the Archive, each archived item with Restore and, where it can be deleted,
// Delete for good behind a type-the-name confirmation. Web and phone wrap it.

import { useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useLogic, type ArchivedItem } from '@/src/logic/library/useLogic';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import s from './Library.module.css';

export function LibraryBody() {
  const v = useLogic();
  const [deleting, setDeleting] = useState<ArchivedItem | null>(null);
  return (
    <div className={s.body}>
      <section className={s.card} aria-label="Resources">
        <header className={s.head}>
          <span className={s.overline}>Resource</span>
        </header>
        <div className={s.emptyRow}>
          <FileText size={18} strokeWidth={1.75} aria-hidden />
          <p>
            Resources will hold notes, files and links for your areas, folders and projects. Until then, keep them in a project&apos;s notes on its page, under <Link href="/work">Work</Link>.
          </p>
        </div>
      </section>

      <h2 className={s.overline}>Archive · nothing is ever deleted by archiving</h2>
      <ScreenState loading={v.loading} />
      {!v.loading && (
        <section className={s.card} aria-label="Archive">
          {v.archive.length ? (
            v.archive.map((item) => (
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
            <p className={s.emptyText}>Nothing archived. When you archive a project, folder, task or person, it waits here.</p>
          )}
        </section>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name} for good?`}
          message={deleting.kind === 'Project' ? 'This deletes the project and every task in it. It cannot be undone. Restoring it instead keeps everything.' : 'This cannot be undone.'}
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
