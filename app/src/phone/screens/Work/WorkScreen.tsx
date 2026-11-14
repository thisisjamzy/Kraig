'use client';

// Work on a phone (Dreda.figcraft `Work / Phone`): one card per area with
// its counts, progress and next due, its folders as chips with their task
// counts, and Open area. The same data as the web page (src/logic/work).

import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { useLogic } from '@/src/logic/work/useLogic';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from '@/src/phone/screens/Work/WorkScreen.module.css';

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export function WorkScreen() {
  const w = useLogic();
  const goBack = useGoBack();
  const t = w.tree.totals;
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.round} onClick={() => goBack('/projects')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Work"
        right={
          <Link href="/areas/new" className={styles.round} aria-label="New area">
            <Plus size={16} strokeWidth={2.5} />
          </Link>
        }
      />
      <p className={styles.summary}>
        {plural(t.areas, 'area')} · {plural(t.tasks, 'task')} · {plural(t.projects, 'project')}
      </p>
      <ScreenState loading={w.loading} />
      {!w.loading && !w.tree.areas.length && <p className={styles.empty}>No areas yet. Tap + to add one.</p>}
      <div className={styles.cards}>
        {w.tree.areas.map((area) => {
          const pct = area.tasks ? Math.round((area.done / area.tasks) * 100) : 0;
          return (
            <section key={area.id} className={styles.card}>
              <div className={styles.head}>
                <span className={styles.swatch} style={{ background: area.color }} aria-hidden>
                  {area.initials}
                </span>
                <span className={styles.name}>{area.name}</span>
                <span className={styles.pct}>{pct}%</span>
              </div>
              <p className={styles.meta}>
                {plural(area.folders.length, 'folder')} · {plural(area.projects, 'project')} · {plural(area.tasks, 'task')}
                {area.nextDue ? ` · next due ${day(area.nextDue)}` : ''}
              </p>
              <span className={styles.track} aria-hidden>
                <span style={{ width: `${pct}%`, background: area.color }} />
              </span>
              {area.folders.length > 0 && (
                <div className={styles.chips}>
                  {area.folders.map((f) => (
                    <Link key={f.id} href={`/sections/${f.id}`} className={styles.chip}>
                      {f.name} · {f.openTasks}
                    </Link>
                  ))}
                </div>
              )}
              <Link href={`/areas/${area.id}`} className={styles.open}>
                Open area
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}
