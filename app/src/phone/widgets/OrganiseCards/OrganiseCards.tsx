'use client';

// Time v1.0's Organise cards on the phone (Dreda v1.0 `Projects / Phone`
// 68782, `Areas` 68990, `Area detail` 69829, `Folders` 69139, `Folder
// detail` 69318): view chips, the hue tile and bar, and the project,
// folder and area cards.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Folder, LayoutGrid } from 'lucide-react';
import { crumbOf, plural, type AreaStat, type FolderStat, type NextUp, type ProjectStat } from '@/src/viewmodels/organise';
import { hueVars, type LabelHue } from '@/src/viewmodels/projects';
import { dayText, durationText } from '@/src/viewmodels/todayPlan';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import styles from '@/src/phone/widgets/OrganiseCards/OrganiseCards.module.css';

export function ViewChips<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className={styles.chips} role="tablist" aria-label="View">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Tile({ hue, children, size = 40 }: { hue: LabelHue; children: ReactNode; size?: number }) {
  const v = hueVars(hue);
  return (
    <span className={styles.tile} style={{ width: size, height: size, background: v.bg, color: v.fg }} aria-hidden>
      {children}
    </span>
  );
}

export function Bar({ hue, value, end }: { hue: LabelHue; value: number; end?: ReactNode }) {
  return (
    <span className={styles.barRow}>
      <span className={styles.bar} role="img" aria-label={`${Math.round(value * 100)}% done`}>
        <span
          style={{
            width: `${Math.round(value * 100)}%`,
            background: hueVars(hue).solid,
          }}
        />
      </span>
      {end !== undefined && <span className={styles.barEnd}>{end}</span>}
    </span>
  );
}

const HEALTH_HUE: Record<string, LabelHue> = {
  'On track': 'green',
  'At risk': 'orange',
  Watch: 'amber',
};

function Pill({ hue, dot, children }: { hue: LabelHue; dot?: boolean; children: ReactNode }) {
  const v = hueVars(hue);
  return (
    <span className={styles.pill} style={{ background: v.bg, color: hue === 'grey' ? undefined : v.fg }}>
      {dot && <span className={styles.pillDot} style={{ background: v.solid }} aria-hidden />}
      {children}
    </span>
  );
}

/** A project: tile, name, crumb (or brief), progress, then health or
 * overdue, due and hours booked this week. */
export function ProjectCard({ p, brief = false }: { p: ProjectStat; brief?: boolean }) {
  const sub = brief ? p.description : crumbOf(p);
  return (
    <Link href={`/projects/${p.id}`} className={styles.card}>
      <span className={styles.head}>
        <Tile hue={p.hue}>{p.letter}</Tile>
        <span className={styles.text}>
          <span className={styles.name}>{p.name}</span>
          {sub && <span className={styles.sub}>{sub}</span>}
        </span>
        <ChevronRight size={20} strokeWidth={2} className={styles.chevron} aria-hidden />
      </span>
      <Bar hue={p.hue} value={p.progress} end={`${p.done}/${p.total}`} />
      <span className={styles.pills}>
        {p.overdue > 0 ? (
          <Pill hue="rose" dot>
            {p.overdue} overdue
          </Pill>
        ) : (
          HEALTH_HUE[p.health] && (
            <Pill hue={HEALTH_HUE[p.health]} dot>
              {p.health}
            </Pill>
          )
        )}
        {p.end && (
          <Pill hue="grey">
            Due{' '}
            {p.end.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </Pill>
        )}
        {p.weekMinutes > 0 && <Pill hue="purple">{durationText(p.weekMinutes)} blocked</Pill>}
      </span>
    </Link>
  );
}

/** An area or a folder: always the same size (tile, name, a two-line
 * brief, counts, progress). What is inside shows on its own page. */
function ContainerCard({ href, hue, icon, name, description, meta, progress }: { href: string; hue: LabelHue; icon: ReactNode; name: string; description: string; meta: string; progress: number }) {
  return (
    <Link href={href} className={styles.card}>
      <span className={styles.head}>
        <Tile hue={hue}>{icon}</Tile>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.brief}>{description}</span>
        </span>
        <ChevronRight size={20} strokeWidth={2} className={styles.chevron} aria-hidden />
      </span>
      <span className={styles.meta}>{meta}</span>
      <Bar hue={hue} value={progress} end={`${Math.round(progress * 100)}%`} />
    </Link>
  );
}

export function FolderCard({ f }: { f: FolderStat }) {
  return (
    <ContainerCard
      href={`/sections/${f.id}`}
      hue={f.hue}
      icon={<Folder size={20} />}
      name={f.name}
      description={f.description}
      meta={[plural(f.projects.length, 'project'), `${f.open} open`, f.overdue ? `${f.overdue} overdue` : `${f.weekMinutes ? durationText(f.weekMinutes) : '0 h'} this week`].join(' · ')}
      progress={f.progress}
    />
  );
}

export function AreaCard({ a }: { a: AreaStat }) {
  return (
    <ContainerCard
      href={`/areas/${a.id}`}
      hue={a.hue}
      icon={<LayoutGrid size={20} />}
      name={a.name}
      description={a.description}
      meta={[plural(a.folders.length, 'folder'), plural(a.projects.length, 'project'), `${a.open} open`, a.overdue ? `${a.overdue} overdue` : null].filter(Boolean).join(' · ')}
      progress={a.progress}
    />
  );
}

/** "• Work 4": a group heading over cards. */
export function GroupHead({ hue, label, count }: { hue: LabelHue; label: string; count: string }) {
  return (
    <h2 className={styles.group}>
      <span className={styles.groupDot} style={{ background: hueVars(hue).solid }} aria-hidden />
      {label}
      <span className={styles.groupCount}>{count}</span>
    </h2>
  );
}

/** Next up: each task with its project's letter and when it is due. */
export function NextUpList({ items, projects }: { items: NextUp[]; projects: ProjectStat[] }) {
  const taskPanel = useTaskPanel();
  const byId = new Map(projects.map((p) => [p.id, p]));
  const now = new Date();
  return (
    <div className={styles.nextList}>
      {items.map((n) => {
        const p = n.projectId ? byId.get(n.projectId) : undefined;
        return (
          <button key={n.id} type="button" className={`${styles.innerRow} ${styles.rowButton}`} onClick={() => taskPanel.open(n.id)}>
            {p && (
              <Tile hue={p.hue} size={22}>
                <span className={styles.smallLetter}>{p.letter}</span>
              </Tile>
            )}
            <span className={styles.innerName}>{n.title}</span>
            <span className={n.overdue ? styles.late : styles.innerMeta}>{n.date ? (n.overdue ? 'Overdue' : dayText(n.date, now)) : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
