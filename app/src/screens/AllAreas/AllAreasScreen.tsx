'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/allAreas/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { SwipeableListItem } from '@/src/widgets/SwipeableListItem/SwipeableListItem';
import styles from './AllAreasScreen.module.css';

export function AllAreasScreen() {
  const strings = useStrings();
  const { areas, archiveArea, goBack, loading, error } = useLogic();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingArea = areas.find((area) => area.id === pendingDeleteId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.projects.tabAreas}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {areas.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyAreas}</p>
          ) : (
            <div className={styles.list}>
              {areas.map((area) => (
                <SwipeableListItem
                  key={area.id}
                  className={styles.listItem}
                  deleteLabel={`Delete ${area.name}`}
                  onDelete={() => setPendingDeleteId(area.id)}
                >
                  <Link href={`/areas/${area.id}`} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={styles.dot} style={{ background: area.color }} />
                      <span className={styles.name}>
                        {area.emoji ? `${area.emoji} ` : ''}
                        {area.name}
                      </span>
                    </div>

                    {area.description && <p className={styles.description}>{area.description}</p>}

                    <div className={styles.metaRow}>
                      <span className={styles.metaChip}>
                        {area.projectCount} {strings.projects.projectCountSuffix}
                      </span>
                    </div>
                  </Link>
                </SwipeableListItem>
              ))}
            </div>
          )}
        </>
      )}

      {pendingArea && (
        <ConfirmDialog
          title={strings.projects.archiveAreaConfirmTitle}
          message={strings.projects.archiveAreaConfirmMessage}
          confirmLabel={strings.common.delete}
          cancelLabel={strings.common.cancel}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            archiveArea(pendingArea.id);
            setPendingDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
