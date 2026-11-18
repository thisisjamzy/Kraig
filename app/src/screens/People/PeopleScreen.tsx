'use client';

// People (Dreda v1.0 `People / Web` 56563).
//   Title "People"; under it "6 people, 2 waiting on you, you are waiting
//   on 3". Add person in the top bar (a dialog).
//   Four stat cards: waiting on you, you are waiting on, going cold, seen
//   this week. Waiting on you (Reply) beside You are waiting on (Nudge,
//   Nudge all), then Everyone by last in touch (Message). Faces are the
//   local Notionist avatars.
// People are kept in this session only until the `people` collection is
// approved (BUILD-KIT section 7.5): see src/logic/people.

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, AtSign, Bell, Users } from 'lucide-react';
import { usePeopleBoard, usePeopleList, usePersonForm } from '@/src/logic/people/useLogic';
import { lastTouchWords, lateWords, type WaitRow } from '@/src/viewmodels/people';
import { plural } from '@/src/viewmodels/organise';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { Modal } from '@/src/widgets/Modal/Modal';
import { StatCards } from '@/src/widgets/Dashboard/StatCard';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import { Avatar, PersonFormFields, peopleStyles } from '@/src/widgets/People/People';
import { HeaderPrimaryButton } from '@/src/screens/Organise/parts';
import styles from './PeopleScreen.module.css';

export function PeopleScreen() {
  const b = usePeopleBoard();
  const list = usePeopleList();
  const [adding, setAdding] = useState(false);
  const oldest = b.waitingOnYou[0];
  const longest = b.youWait[0];
  const n = b.everyone.length;

  return (
    <NotionPage
      title="People"
      sub={`${plural(n, 'person', 'people')}, ${b.waitingOnYou.length} waiting on you, you are waiting on ${b.youWait.length}`}
      crumbs={[{ label: 'People', href: '/people' }]}
    >
      <HeaderPrimaryButton label="Add person" onClick={() => setAdding(true)} />
      <StatCards
        stats={[
          {
            label: 'Waiting on you',
            icon: <Bell size={18} />,
            value: String(b.waitingOnYou.length),
            chip: oldest ? { text: oldest.late ? 'Reply today' : 'Reply soon', hue: 'amber' } : null,
            caption: oldest ? `oldest ${plural(Math.max(oldest.waiting, oldest.late), 'day')}` : 'nothing waiting',
            href: '/tasks',
          },
          {
            label: 'You are waiting on',
            icon: <Users size={18} />,
            value: String(b.youWait.length),
            chip: b.youWait.length ? { text: `Nudge ${b.youWait.filter((r) => r.waiting >= 2).length}`, hue: 'grey' } : null,
            caption: longest ? `1 waiting ${plural(longest.waiting, 'day')}` : 'nothing out',
          },
          { label: 'Going cold', icon: <AlertCircle size={18} />, value: String(b.cold.length), chip: b.cold.length ? { text: plural(b.cold.length, 'person', 'people'), hue: 'rose' } : null, caption: 'quiet for 30 days' },
          { label: 'Seen this week', icon: <AtSign size={18} />, value: String(b.seenThisWeek), caption: `across ${plural(b.seenProjects, 'project')}` },
        ]}
      />

      <div className={styles.pair}>
        <section className={styles.card} aria-label="Waiting on you">
          <header className={styles.head}>
            <h2 className={styles.title}>
              Waiting on you <span className={styles.countRose}>{b.waitingOnYou.length}</span>
            </h2>
            <Link href="/tasks" className={styles.link}>
              Open in Tasks
            </Link>
          </header>
          {b.waitingOnYou.length === 0 ? <p className={styles.empty}>Nobody is waiting on you.</p> : b.waitingOnYou.map((r) => <WaitLine key={r.item.id} row={r} action={r.late ? 'Reply' : 'Send'} onAction={() => b.reply(r)} mine />)}
        </section>
        <section className={styles.card} aria-label="You are waiting on">
          <header className={styles.head}>
            <h2 className={styles.title}>
              You are waiting on <span className={styles.count}>{b.youWait.length}</span>
            </h2>
            {b.youWait.length > 0 && (
              <button type="button" className={styles.link} onClick={b.nudgeAll}>
                Nudge all
              </button>
            )}
          </header>
          {b.youWait.length === 0 ? <p className={styles.empty}>You are not waiting on anyone.</p> : b.youWait.map((r) => <WaitLine key={r.item.id} row={r} action="Nudge" onAction={() => b.nudge(r)} />)}
        </section>
      </div>

      <section className={styles.card} aria-label="Everyone">
        <header className={styles.head}>
          <h2 className={styles.title}>
            Everyone <span className={styles.count}>{n}</span>
          </h2>
          <span className={styles.link}>Sort: Last in touch</span>
        </header>
        {b.everyone.map((p) => {
          const open = p.waitingOnYou.length + p.youWaitFor.length;
          return (
            <div key={p.id} className={styles.row}>
              <Link href={`/people/${p.id}`} className={styles.who}>
                <Avatar id={p.avatarId} size={40} />
                <span>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.meta}>{[p.role, lastTouchWords(p.lastSpoke, b.now)].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
              <span className={styles.tags}>
                {p.tag && <HueTag hue={p.tag.hue}>{p.tag.name}</HueTag>}
                <HueTag hue="grey">{open} open</HueTag>
              </span>
              <button type="button" className={styles.action} onClick={() => b.message(p)} disabled={!b.hasContact(p)}>
                Message
              </button>
            </div>
          );
        })}
      </section>
      {adding && <AddPerson categories={list.categories} onClose={() => setAdding(false)} />}
    </NotionPage>
  );
}

function WaitLine({ row, action, onAction, mine }: { row: WaitRow; action: string; onAction: () => void; mine?: boolean }) {
  const { person, item } = row;
  const due = item.due ? `Due ${item.due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : null;
  return (
    <div className={styles.row}>
      <Link href={`/people/${person.id}`} className={styles.who}>
        <Avatar id={person.avatarId} size={40} />
        <span>
          <span className={styles.name}>{person.name}</span>
          <span className={styles.meta}>{mine ? item.title : item.why || item.title}</span>
        </span>
      </Link>
      <span className={styles.tags}>
        {item.tag && <HueTag hue={item.tag.hue}>{item.tag.name}</HueTag>}
        {row.late > 0 ? (
          <span className={styles.late}>
            <span className={styles.lateDot} aria-hidden />
            {lateWords(row.late)}
          </span>
        ) : !mine && !item.due && row.waiting > 0 ? (
          <span className={styles.waiting}>
            <span className={styles.waitingDot} aria-hidden />
            Waiting {plural(row.waiting, 'day')}
          </span>
        ) : (
          due && <HueTag hue="grey">{due}</HueTag>
        )}
      </span>
      <button type="button" className={mine ? styles.outline : styles.action} onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

function AddPerson({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const form = usePersonForm(onClose, categories[0]);
  return (
    <Modal title="Add person" onClose={onClose}>
      <form
        className={styles.dialog}
        onSubmit={(e) => {
          e.preventDefault();
          form.save();
        }}
      >
        <PersonFormFields draft={form.draft} update={form.update} categories={categories} error={form.error} />
        <span className={styles.dialogActions}>
          <button type="button" className={peopleStyles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={peopleStyles.primary}>
            Add person
          </button>
        </span>
      </form>
    </Modal>
  );
}

