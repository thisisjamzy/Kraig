'use client';

// People, the page bodies (Dreda.figcraft `People / Web`, `Person / Web`,
// `Person / New`, `People / Phone`). The web and phone screens wrap them in
// their own headers. A person is a record you keep, never an account.

import Link from 'next/link';
import { Archive, ArrowRight, BellOff, Circle, Hourglass, Shuffle, Star, Table2, Users } from 'lucide-react';
import type { PersonDraft } from '@/src/logic/people/useLogic';
import { AVATAR_IDS, CHANNELS, PRIORITY_LABEL, avatarSrc, firstName, lastSpokeWords, type PeopleFilter, type Person } from '@/src/viewmodels/people';
import { FieldCard, SelectField, SwitchField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
import { TypeTabs } from '@/src/widgets/Database/TypeTabs';
import s from './People.module.css';

export function Avatar({ id, size = 40, alt = '' }: { id: string; size?: number; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- local SVG asset, no optimisation to gain
  return <img src={avatarSrc(id)} alt={alt} width={size} height={size} className={s.avatar} />;
}

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function PeopleFilters({ value, onChange, counts }: { value: PeopleFilter; onChange: (f: PeopleFilter) => void; counts: Record<PeopleFilter, number> }) {
  return (
    <TypeTabs<PeopleFilter>
      label="Show"
      value={value}
      onChange={onChange}
      tabs={[
        { key: 'everyone', label: 'Everyone', icon: Table2, count: counts.everyone },
        { key: 'high', label: 'High priority', icon: Star, count: counts.high },
        { key: 'waitingOnYou', label: 'Waiting on you', icon: Hourglass, count: counts.waitingOnYou },
        { key: 'youWait', label: 'You are waiting', icon: Users, count: counts.youWait },
        { key: 'quiet', label: 'Quiet', icon: BellOff, count: counts.quiet },
      ]}
    />
  );
}

export function PeopleGroups({ groups, now, onAdd }: { groups: { label: string; people: Person[] }[]; now: Date; onAdd?: (category: string) => void }) {
  if (!groups.length) return <p className={s.empty}>Nobody here yet. Add the people your work waits on, so you can see who is waiting on what.</p>;
  return (
    <div className={s.groups}>
      {groups.map((g) => (
        <section key={g.label} className={s.group} aria-label={g.label}>
          <header className={s.groupHead}>
            <span className={s.overline}>
              {g.label} · {g.people.length}
            </span>
            {onAdd && (
              <button type="button" className={s.textLink} onClick={() => onAdd(g.label)}>
                + Add to this category
              </button>
            )}
          </header>
          {g.people.map((p) => (
            <Link key={p.id} href={`/people/${p.id}`} className={s.row}>
              <Avatar id={p.avatarId} />
              <span className={s.who}>
                <span className={s.name}>{p.name}</span>
                <span className={s.meta}>{[p.role, p.email || p.phone || (p.preferredChannel === 'whatsapp' ? 'on WhatsApp' : ''), lastSpokeWords(p.lastSpoke, now)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={s.chip} data-priority={p.priority}>
                {PRIORITY_LABEL[p.priority]}
              </span>
              <span className={s.waitingOn}>{p.waitingOnYou.length ? `${p.waitingOnYou.length} waiting on you` : '–'}</span>
              <span className={s.youWait}>{p.youWaitFor.length ? `${p.youWaitFor.length} you are waiting for` : '–'}</span>
              <span className={s.open}>
                Open <ArrowRight size={14} strokeWidth={2} aria-hidden />
              </span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

function WaitList({ title, items, nudge }: { title: string; items: Person['waitingOnYou']; nudge?: string }) {
  return (
    <section className={s.waitBlock}>
      <h2 className={s.overline}>{title}</h2>
      {items.length ? (
        <div className={s.card}>
          {items.map((w) => (
            <div key={w.id} className={s.waitRow}>
              <Circle size={20} strokeWidth={1.5} aria-hidden className={s.waitCheck} />
              <span className={s.who}>
                <span className={s.waitTitle}>{w.title}</span>
                <span className={s.meta}>{[w.where, w.why, w.due ? `due ${day(w.due)}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
            </div>
          ))}
          {nudge && <p className={s.nudge}>{nudge}</p>}
        </div>
      ) : (
        <p className={s.empty}>Nothing right now.</p>
      )}
    </section>
  );
}

export function PersonBody({ person, onArchive }: { person: Person; onArchive: () => void }) {
  const first = firstName(person.name);
  const contact = [person.email, person.phone, person.place].filter(Boolean).join(' · ');
  return (
    <div className={s.person}>
      <section className={s.profile}>
        <Avatar id={person.avatarId} size={72} alt="" />
        <div className={s.profileCopy}>
          <h2 className={s.profileName}>{person.name}</h2>
          {contact && <p className={s.meta}>{contact}</p>}
          <span className={s.chips}>
            <span className={s.chip} data-priority={person.priority}>
              {PRIORITY_LABEL[person.priority]}
            </span>
            <span className={s.chip} data-tone="brand">
              {person.category}
            </span>
          </span>
        </div>
        <span className={s.profileActions}>
          {person.email && (
            <a href={`mailto:${person.email}`} className={s.primary}>
              Email {first}
            </a>
          )}
          <Link href="/projects/calendar/links" className={s.secondary}>
            Send a scheduling link
          </Link>
        </span>
      </section>

      <WaitList title="Waiting on you" items={person.waitingOnYou} />
      <WaitList
        title={`You are waiting for ${first}`}
        items={person.youWaitFor}
        nudge={person.youWaitFor.length ? `Nudging sends ${first} an email with the task name and what you need. Nobody gets an account here.` : undefined}
      />

      <section className={s.waitBlock}>
        <h2 className={s.overline}>History</h2>
        <div className={`${s.card} ${s.history}`}>
          {person.history.length ? (
            person.history.map((h, i) => (
              <p key={i}>
                {day(h.date)} · {h.text}
              </p>
            ))
          ) : (
            <p className={s.meta}>Nothing yet.</p>
          )}
          {person.notes && <p className={s.meta}>Notes: {person.notes}</p>}
          <button type="button" className={s.textLink} onClick={onArchive}>
            <Archive size={14} strokeWidth={2} aria-hidden /> Archive {first} · their finished work stays in the archive and they drop off this list
          </button>
        </div>
      </section>
    </div>
  );
}

export function PersonFormFields({
  draft,
  update,
  categories,
  error,
}: {
  draft: PersonDraft;
  update: <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => void;
  categories: string[];
  error: string | null;
}) {
  const shuffle = () => update('avatarId', AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]);
  return (
    <div className={s.form}>
      <fieldset className={s.faces}>
        <legend className={s.label}>Pick a face</legend>
        <span className={s.faceRow}>
          {AVATAR_IDS.slice(0, 6)
            .concat(AVATAR_IDS.slice(0, 6).includes(draft.avatarId as (typeof AVATAR_IDS)[number]) ? [] : [draft.avatarId as (typeof AVATAR_IDS)[number]])
            .map((id) => (
              <button key={id} type="button" className={s.face} aria-pressed={draft.avatarId === id} aria-label={`Face ${id}`} onClick={() => update('avatarId', id)}>
                <Avatar id={id} size={48} />
              </button>
            ))}
          <button type="button" className={s.textLink} onClick={shuffle}>
            <Shuffle size={14} strokeWidth={2} aria-hidden /> Shuffle
          </button>
        </span>
      </fieldset>
      <FieldCard label="Name" error={error}>
        <input className={ff.input} name="person-label" autoComplete="off" autoCorrect="off" data-1p-ignore data-lpignore="true" value={draft.name} placeholder="Nadia Mbeki" onChange={(e) => update('name', e.target.value)} />
      </FieldCard>
      <SelectField label="Category" value={draft.category} options={categories.map((c) => ({ value: c, label: c }))} onChange={(v) => update('category', v)} />
      <SwitchField label="High priority" description="Anything they are waiting for is shown first, on Today and in the sidebar." checked={draft.highPriority} onChange={(on) => update('highPriority', on)} />
      <div className={s.pair}>
        <FieldCard label="Email">
          <input className={ff.input} type="email" name="person-mail" autoComplete="off" value={draft.email} placeholder="name@example.com" onChange={(e) => update('email', e.target.value)} />
        </FieldCard>
        <FieldCard label="Phone">
          <input className={ff.input} type="tel" name="person-tel" autoComplete="off" value={draft.phone} placeholder="+237" onChange={(e) => update('phone', e.target.value)} />
        </FieldCard>
      </div>
      <div className={s.pair}>
        <FieldCard label="Where they are">
          <input className={ff.input} value={draft.place} placeholder="Douala" onChange={(e) => update('place', e.target.value)} />
        </FieldCard>
        <SelectField label="Reach them by" value={draft.preferredChannel} options={CHANNELS} onChange={(v) => update('preferredChannel', v as PersonDraft['preferredChannel'])} />
      </div>
      <FieldCard label="Notes about them">
        <textarea className={ff.input} rows={3} value={draft.notes} placeholder="Prefers one clear ask per email." onChange={(e) => update('notes', e.target.value)} />
      </FieldCard>
      <p className={s.meta}>No invitation is sent. This is only your record of them.</p>
    </div>
  );
}

export const peopleStyles = s;
