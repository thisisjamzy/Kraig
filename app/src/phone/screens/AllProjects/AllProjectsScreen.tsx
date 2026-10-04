'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Layers, Plus } from 'lucide-react';
import { useLogic } from '@/src/phone/logic/allProjects/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { SwipeableListItem } from '@/src/phone/widgets/SwipeableListItem/SwipeableListItem';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { TopBarControls, useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import styles from '@/src/phone/screens/AllProjects/AllProjectsScreen.module.css';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { FileSpreadsheet, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** Wide screens: a small progress ring for the project grid's cards. */
function ProgressRing({ percent }: { percent: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg className={styles.ring} width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`${percent}% done`}>
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className={styles.ringTrack} />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, percent)) / 100)}
        transform="rotate(-90 22 22)"
        className={styles.ringValue}
      />
      <text x="22" y="26" textAnchor="middle" className={styles.ringText}>
        {percent}%
      </text>
    </svg>
  );
}

// Same short date format ProjectCard's own formatDate uses
// (src/widgets/ProjectCard/ProjectCard.tsx) — kept local since that one
// isn't exported, and this list's row isn't that fixed-width carousel
// card (just the same info, laid out full-width).
function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AllProjectsScreen() {
  const router = useRouter();
  const strings = useStrings();
  const { projects, total, fields, list, archiveProject, goBack, loading, error } = useLogic();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingProject = projects.find((project) => project.id === pendingDeleteId) ?? null;
  // Medium screens and up: a grid of project cards; the header's actions
  // move into the shell's top bar.
  const inShell = useHasTopBar();

  return (
    <div className={styles.page} data-shell={inShell || undefined}>
      {inShell && (
        <TopBarControls>
          <Link href="/projects/new" className={styles.topPrimary}>
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            New project
          </Link>
          <Link href="/areas" className={styles.topLink}>
            <Layers size={16} strokeWidth={2.25} aria-hidden />
            {strings.projects.tabAreas}
          </Link>
        </TopBarControls>
      )}
      {!inShell && <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.projects.projectsSectionTitle}
        right={
          <>
            <ActionMenu
              ariaLabel="More"
              triggerClassName={styles.addIconButton}
              triggerIcon={<MoreHorizontal size={16} strokeWidth={2.5} />}
              items={[{ key: 'import', label: 'Import from spreadsheet', icon: <FileSpreadsheet size={14} strokeWidth={2} />, onSelect: () => router.push('/settings/import') }]}
            />
            <Link href="/projects/new" className={styles.addIconButton} aria-label="New project" title="New project">
              <Plus size={16} strokeWidth={2.5} />
            </Link>
          </>
        }
      />}

      <ListQueryBar
        className={styles.toolbarSlot}
        fields={fields}
        query={list.query}
        setQuery={list.setQuery}
        onClear={list.clear}
        count={projects.length}
        noun={['project', 'projects']}
        stickyTop="var(--header-height)"
      />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {total === 0 ? (
            <p className={styles.emptyText}>{strings.projects.emptyProjectsCarousel}</p>
          ) : projects.length === 0 ? (
            <ListQueryEmpty onClear={list.clearFilters} />
          ) : (
            <div className={styles.list}>
              {projects.map((project) => (
                <SwipeableListItem
                  key={project.id}
                  className={styles.listItem}
                  deleteLabel={`Delete ${project.name}`}
                  onDelete={() => setPendingDeleteId(project.id)}
                >
                  <Link href={`/projects/${project.id}`} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={styles.dot} style={{ background: project.color }} />
                      <span className={styles.name}>
                        {project.emoji ? `${project.emoji} ` : ''}
                        {project.name}
                      </span>
                      {inShell && <ProgressRing percent={project.progress} />}
                    </div>

                    <p className={styles.timeline}>
                      {project.startDate ? formatDate(project.startDate) : ''}
                      {' - '}
                      {project.endDate ? formatDate(project.endDate) : ''}
                    </p>

                    {project.description && <p className={styles.description}>{project.description}</p>}

                    {inShell && (
                      <div className={styles.health}>
                        <span className={styles.healthChip} data-health={project.health}>
                          {project.health === 'at risk' ? 'At risk' : project.health === 'watch' ? 'Watch' : 'On track'}
                        </span>
                        {project.overdue > 0 && <span className={styles.overdue}>{project.overdue} overdue</span>}
                        <span className={styles.taskCount}>
                          {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                    )}

                    {(project.areaName || project.bucketName) && (
                      <div className={styles.metaRow}>
                        {project.areaName && <span className={styles.metaChip}>{project.areaName}</span>}
                        {project.bucketName && <span className={styles.metaChip}>{project.bucketName}</span>}
                      </div>
                    )}
                  </Link>
                </SwipeableListItem>
              ))}
            </div>
          )}
        </>
      )}

      {/* Areas' way in on mobile — a floating button, bottom right. */}
      {!inShell && <Link href="/areas" className={styles.areasFab}>
        <Layers size={18} strokeWidth={2.25} aria-hidden />
        {strings.projects.tabAreas}
      </Link>}

      {pendingProject && (
        <ConfirmDialog
          title={strings.projects.archiveProjectConfirmTitle}
          message={strings.projects.archiveProjectConfirmMessage}
          confirmLabel={strings.common.delete}
          cancelLabel={strings.common.cancel}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            archiveProject(pendingProject.id);
            setPendingDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
