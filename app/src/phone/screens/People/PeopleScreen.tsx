'use client';

// People on the phone (Dreda v1.0 `People / Phone` 69981): "People" with
// "6 people · 2 waiting on you", Add person; four small figures; Waiting on
// you, You are waiting on (Nudge, Nudge all) and Going cold (Message).
// Kept in this session until the `people` collection is approved
// (BUILD-KIT section 7.5): see src/logic/people.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { usePeopleBoard } from '@/src/logic/people/useLogic';
import { plural } from '@/src/viewmodels/organise';
import { quietDays, type WaitRow } from '@/src/viewmodels/people';
import { Avatar } from '@/src/widgets/People/People';
import { HeaderButton, TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import styles from '@/src/phone/screens/People/People.module.css';

const due = (d: Date | null) => (d ? `due ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : null);

export function PeopleScreen() {
  const router = useRouter();
  const b = usePeopleBoard();
  const oldest = b.waitingOnYou[0];
  const longest = b.youWait[0];

  return (
    <div className={styles.board}>
      <TimeHeader
        title="People"
        sub={`${plural(b.everyone.length, 'person', 'people')} · ${b.waitingOnYou.length} waiting on you`}
        actions={
          <HeaderButton label="Add person" onClick={() => router.push('/people/new')}>
            <Plus size={20} strokeWidth={2} />
          </HeaderButton>
        }
      />
      <div className={styles.tiles}>
        <Tile label="Waiting on you" value={b.waitingOnYou.length} note={oldest ? `oldest ${plural(Math.max(oldest.late, oldest.waiting), 'day')}` : 'nothing waiting'} />
        <Tile label="You wait on" value={b.youWait.length} note={longest ? `1 waiting ${plural(longest.waiting, 'day')}` : 'nothing out'} />
        <Tile label="Going cold" value={b.cold.length} note="quiet for 30 days" alert={b.cold.length > 0} />
        <Tile label="Seen this week" value={b.seenThisWeek} note={`across ${plural(b.seenProjects, 'project')}`} />
      </div>

      {b.waitingOnYou.length > 0 && (
        <section className={styles.card} aria-label="Waiting on you">
          <header className={styles.head}>
            <h2 className={styles.title}>
              Waiting on you <span className={styles.count}>{b.waitingOnYou.length}</span>
            </h2>
            <Link href="/tasks" className={styles.link}>
              Open in Tasks
            </Link>
          </header>
          {b.waitingOnYou.map((r) => (
            <Line key={r.item.id} row={r} meta={[r.item.why || r.item.title, r.item.tag?.name].filter(Boolean).join(' · ')} right={r.late ? <span className={styles.late}>● {plural(r.late, 'day')}</span> : <button type="button" className={styles.link} onClick={() => b.reply(r)}>Reply</button>} />
          ))}
        </section>
      )}

      {b.youWait.length > 0 && (
        <section className={styles.card} aria-label="You are waiting on">
          <header className={styles.head}>
            <h2 className={styles.title}>
              You are waiting on <span className={styles.count}>{b.youWait.length}</span>
            </h2>
            <button type="button" className={styles.link} onClick={b.nudgeAll}>
              Nudge all
            </button>
          </header>
          {b.youWait.map((r) => (
            <Line
              key={r.item.id}
              row={r}
              meta={[r.item.why || r.item.title, due(r.item.due) ?? (r.waiting ? `waiting ${plural(r.waiting, 'day')}` : null)].filter(Boolean).join(' · ')}
              right={
                <button type="button" className={styles.link} onClick={() => b.nudge(r)}>
                  Nudge
                </button>
              }
            />
          ))}
        </section>
      )}

      {b.cold.length > 0 && (
        <section className={styles.card} aria-label="Going cold">
          <header className={styles.head}>
            <h2 className={styles.title}>
              Going cold <span className={styles.count}>{b.cold.length}</span>
            </h2>
          </header>
          {b.cold.map((p) => (
            <div key={p.id} className={styles.row}>
              <Link href={`/people/${p.id}`} className={styles.who}>
                <Avatar id={p.avatarId} size={40} />
                <span>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.meta}>{[`Quiet for ${quietDays(p, b.now) ?? 30} days`, p.tag?.name].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
              <button type="button" className={styles.link} onClick={() => b.message(p)} disabled={!b.hasContact(p)}>
                Message
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, note, alert }: { label: string; value: number; note: string; alert?: boolean }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <strong className={styles.tileValue}>{value}</strong>
      <span className={alert ? styles.tileAlert : styles.tileNote}>{note}</span>
    </div>
  );
}

function Line({ row, meta, right }: { row: WaitRow; meta: string; right: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <Link href={`/people/${row.person.id}`} className={styles.who}>
        <Avatar id={row.person.avatarId} size={40} />
        <span>
          <span className={styles.name}>{row.person.name}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
      </Link>
      {right}
    </div>
  );
}
