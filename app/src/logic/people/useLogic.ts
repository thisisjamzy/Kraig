'use client';

// People and a person's page. UI only: records live in the in-memory store
// (./store.ts) until a `people` collection exists; nothing is sent anywhere.

import { useMemo, useState } from 'react';
import { contactHref, DEFAULT_CATEGORIES, filterPeople, goingCold, groupPeople, waitingOnYouRows, youWaitRows, type WaitRow, type Channel, type PeopleFilter, type PeopleSort, type Person, type PersonPriority } from '@/src/viewmodels/people';
import { peopleStore, usePeople } from './store';

export interface PersonDraft {
  avatarId: string;
  name: string;
  category: string;
  highPriority: boolean;
  email: string;
  phone: string;
  place: string;
  preferredChannel: Channel;
  notes: string;
}

const EMPTY: PersonDraft = { avatarId: 'w1', name: '', category: DEFAULT_CATEGORIES[0], highPriority: false, email: '', phone: '', place: '', preferredChannel: 'email', notes: '' };

export function usePeopleList() {
  const people = usePeople();
  const [filter, setFilter] = useState<PeopleFilter>('everyone');
  const [sort, setSort] = useState<PeopleSort>('category');
  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => groupPeople(filterPeople(people, filter, now), sort), [people, filter, sort, now]);
  const counts = useMemo(
    () => ({
      everyone: filterPeople(people, 'everyone', now).length,
      high: filterPeople(people, 'high', now).length,
      waitingOnYou: filterPeople(people, 'waitingOnYou', now).length,
      youWait: filterPeople(people, 'youWait', now).length,
      quiet: filterPeople(people, 'quiet', now).length,
    }),
    [people, now]
  );
  const categories = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...people.map((p) => p.category)])], [people]);
  return { people, groups, counts, filter, setFilter, sort, setSort, categories, now };
}

export function usePersonForm(onSaved: (id: string) => void, initialCategory?: string) {
  const [draft, setDraft] = useState<PersonDraft>({ ...EMPTY, category: initialCategory ?? EMPTY.category });
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  function save() {
    if (!draft.name.trim()) {
      setError('Give them a name.');
      return;
    }
    const id = `local-${Date.now().toString(36)}`;
    const priority: PersonPriority = draft.highPriority ? 'high' : 'normal';
    const person: Person = {
      id,
      name: draft.name.trim(),
      role: '',
      category: draft.category.trim() || DEFAULT_CATEGORIES[0],
      priority,
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      place: draft.place.trim(),
      preferredChannel: draft.preferredChannel,
      notes: draft.notes.trim(),
      avatarId: draft.avatarId,
      archived: false,
      lastSpoke: null,
      waitingOnYou: [],
      youWaitFor: [],
      history: [],
    };
    peopleStore.add(person);
    onSaved(id);
  }
  return { draft, update, error, save };
}

export function usePerson(id: string) {
  const people = usePeople();
  const person = people.find((p) => p.id === id) ?? null;
  return {
    person,
    archive: () => person && peopleStore.update(person.id, { archived: true }),
    restore: () => person && peopleStore.update(person.id, { archived: false }),
  };
}

/** Time v1.0 People (Dreda v1.0 `People` 56563, phone 69981): who waits on
 * you, who you wait on, who is going cold, and everyone by last in touch.
 * Nudge and Reply open a message on their channel and count as being in
 * touch today. */
export function usePeopleBoard() {
  const people = usePeople();
  const now = useMemo(() => new Date(), []);
  const live = useMemo(() => people.filter((p) => !p.archived), [people]);
  const waitingOnYou = useMemo(() => waitingOnYouRows(people, now), [people, now]);
  const youWait = useMemo(() => youWaitRows(people, now), [people, now]);
  const cold = useMemo(() => goingCold(people, now), [people, now]);
  const everyone = useMemo(() => [...live].sort((a, b) => (b.lastSpoke?.getTime() ?? 0) - (a.lastSpoke?.getTime() ?? 0)), [live]);
  const seenThisWeek = live.filter((p) => p.lastSpoke && now.getTime() - p.lastSpoke.getTime() < 7 * 86_400_000).length;
  const seenProjects = new Set(live.filter((p) => p.lastSpoke && now.getTime() - p.lastSpoke.getTime() < 7 * 86_400_000).flatMap((p) => p.projects ?? [])).size;

  function contact(person: Person, subject: string) {
    const href = contactHref(person, subject);
    peopleStore.update(person.id, { lastSpoke: new Date() });
    if (href) window.open(href, '_blank', 'noopener');
  }

  return {
    now,
    everyone,
    waitingOnYou,
    youWait,
    cold,
    seenThisWeek,
    seenProjects,
    reply: (row: WaitRow) => contact(row.person, row.item.why || row.item.title),
    nudge: (row: WaitRow) => contact(row.person, `Checking in: ${row.item.why || row.item.title}`),
    /** One email to everyone you wait on, each in Bcc. */
    nudgeAll: () => {
      const emails = [...new Set(youWait.map((r) => r.person.email).filter(Boolean))];
      youWait.forEach((row) => peopleStore.update(row.person.id, { lastSpoke: new Date() }));
      if (emails.length) window.open(`mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent('Checking in')}`, '_blank', 'noopener');
    },
    message: (person: Person) => contact(person, 'Hello'),
    hasContact: (person: Person) => contactHref(person, '') !== null,
  };
}
