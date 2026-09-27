'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/allAreas/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import styles from './AllAreasScreen.module.css';

export function AllAreasScreen() {
  const strings = useStrings();
  const { areas, archiveArea, goBack, loading, error } = useLogic();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingArea = areas.find((area) => area.id === pendingDeleteId) ?? null;

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.projects.tabAreas}
        right={
          <Link href="/areas/new" className={styles.addIconButton} aria-label="New area" title="New area">
            <Plus size={16} strokeWidth={2.5} />
          </Link>
        }
      />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {areas.length === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyAreas}</p>
          ) : (
            <div className={styles.grid}>
              {areas.map((area) => (
                <div key={area.id} className={styles.tile} style={{ ['--area-color' as string]: area.color }}>
                  <Link href={`/areas/${area.id}`} className={styles.tileLink}>
                    <span className={styles.tileIcon} aria-hidden>
                      {area.emoji ?? area.name.charAt(0).toUpperCase()}
                    </span>
                    <span className={styles.tileName}>{area.name}</span>
                    {area.description && <span className={styles.tileDescription}>{area.description}</span>}
                    <span className={styles.tileMeta}>
                      {area.projectCount} {area.projectCount === 1 ? 'project' : strings.projects.projectCountSuffix}
                    </span>
                  </Link>
                  <div className={styles.tileMenu}>
                    <ActionMenu
                      ariaLabel={`Actions for ${area.name}`}
                      items={[
                        {
                          key: 'delete',
                          label: strings.common.delete,
                          icon: <Trash2 size={14} strokeWidth={2} />,
                          onSelect: () => setPendingDeleteId(area.id),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                </div>
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
