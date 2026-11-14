'use client';

// People, held in memory for now (no `people` collection yet). Shared by the
// People page, a person's page and the Add someone form within a session;
// gone on reload. The records below are samples so the screens can be seen.

import { useSyncExternalStore } from 'react';
import type { Person } from '@/src/viewmodels/people';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

let people: Person[] = [
  {
    id: 'sample-nadia',
    name: 'Nadia Mbeki',
    role: 'Design partner',
    category: 'Clients and partners',
    priority: 'high',
    email: 'nadia@example.com',
    phone: '',
    place: 'Douala',
    preferredChannel: 'email',
    notes: 'Prefers one clear ask per email. Replies within a day.',
    avatarId: 'w1',
    archived: false,
    lastSpoke: daysAgo(2),
    waitingOnYou: [
      { id: 'n1', title: 'Rebuild the time screens from the new references', where: 'Dreda / Design', why: 'she needs it to sign off the direction', due: inDays(7) },
      { id: 'n2', title: 'Send the landing page copy deck', where: 'Dreda / Design', why: 'promised on the call', due: inDays(4) },
    ],
    youWaitFor: [{ id: 'n3', title: 'Review the new time screens', where: 'Dreda / Design', why: 'nothing back yet', due: null }],
    history: [
      { date: daysAgo(2), text: 'Sent the first pass of the time screens for review' },
      { date: daysAgo(8), text: 'Call, 40 min · agreed the folder wording' },
    ],
  },
  {
    id: 'sample-emeka',
    name: 'Emeka, the builder',
    role: 'Limbe house',
    category: 'Family and home',
    priority: 'normal',
    email: '',
    phone: '+237 6 00 00 00 00',
    place: 'Limbe',
    preferredChannel: 'whatsapp',
    notes: '',
    avatarId: 'm3',
    archived: false,
    lastSpoke: daysAgo(8),
    waitingOnYou: [],
    youWaitFor: [{ id: 'e1', title: 'Quote for the roof repair', where: 'Home and health / Limbe house', why: 'asked on WhatsApp', due: inDays(3) }],
    history: [{ date: daysAgo(8), text: 'Walked the site and agreed the scope' }],
  },
  {
    id: 'sample-accountant',
    name: 'The accountant',
    role: 'Year end',
    category: 'Money and admin',
    priority: 'normal',
    email: 'books@example.com',
    phone: '',
    place: '',
    preferredChannel: 'email',
    notes: '',
    avatarId: 'm5',
    archived: false,
    lastSpoke: daysAgo(17),
    waitingOnYou: [{ id: 'a1', title: 'Send the bank statements', where: 'Money / Debt plan', why: 'needed for the year end', due: inDays(10) }],
    youWaitFor: [],
    history: [],
  },
];

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const peopleStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => people,
  add(person: Person) {
    people = [...people, person];
    emit();
  },
  update(id: string, patch: Partial<Person>) {
    people = people.map((p) => (p.id === id ? { ...p, ...patch } : p));
    emit();
  },
};

export function usePeople() {
  return useSyncExternalStore(peopleStore.subscribe, peopleStore.get, peopleStore.get);
}
