'use client';

// People, held in memory for now (no `people` collection yet: BUILD-KIT
// section 7.5, waiting on the owner). Shared by the People page, a
// person's page, the Add person form and the project cards within a
// session; gone on reload. The records below are the samples the v1.0
// frames are drawn with, so the screens can be seen.

import { useSyncExternalStore } from 'react';
import type { Person } from '@/src/viewmodels/people';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

const base = { priority: 'normal' as const, phone: '', place: '', notes: '', archived: false, history: [], waitingOnYou: [], youWaitFor: [] };

let people: Person[] = [
  {
    ...base,
    id: 'sample-ade',
    name: 'Ade Bello',
    role: 'Landlord',
    category: 'Family and home',
    email: 'ade@example.com',
    preferredChannel: 'email',
    avatarId: 'm2',
    lastSpoke: daysAgo(3),
    tag: { name: 'Home', hue: 'amber' },
    projects: ['Home'],
    waitingOnYou: [{ id: 'ade-1', title: 'Wants your reply on the flat viewing', where: 'Home', why: 'Flat viewing reply', due: daysAgo(3), since: daysAgo(3), tag: { name: 'Home', hue: 'amber' } }],
  },
  {
    ...base,
    id: 'sample-clarisse',
    name: 'Clarisse Tabi',
    role: 'Accountant',
    category: 'Money and admin',
    email: 'clarisse@example.com',
    preferredChannel: 'email',
    avatarId: 'w2',
    lastSpoke: daysAgo(1),
    tag: { name: 'Savings', hue: 'teal' },
    projects: ['Savings'],
    waitingOnYou: [{ id: 'cla-1', title: 'Needs your October expenses claim', where: 'Savings', why: 'October expenses claim', due: daysAgo(1), since: daysAgo(2), tag: { name: 'Savings', hue: 'teal' } }],
  },
  {
    ...base,
    id: 'sample-manou',
    name: 'Manou Eyong',
    role: 'Designer',
    category: 'Clients and partners',
    priority: 'high',
    email: 'manou@example.com',
    preferredChannel: 'email',
    avatarId: 'w3',
    lastSpoke: daysAgo(0),
    tag: { name: 'Landing page', hue: 'blue' },
    projects: ['Landing page', 'Dreda'],
    youWaitFor: [{ id: 'man-1', title: 'Hero copy draft', where: 'Landing page', why: 'Hero copy draft', due: inDays(1), since: daysAgo(1), tag: { name: 'Landing page', hue: 'blue' } }],
  },
  {
    ...base,
    id: 'sample-tanyi',
    name: 'Tanyi Ebot',
    role: 'Community lead',
    category: 'Clients and partners',
    phone: '+237 600 000 001',
    email: 'tanyi@example.com',
    preferredChannel: 'whatsapp',
    avatarId: 'm4',
    lastSpoke: daysAgo(2),
    tag: { name: 'Beta invites', hue: 'rose' },
    projects: ['Beta invites', 'Dreda'],
    youWaitFor: [{ id: 'tan-1', title: 'Beta tester list', where: 'Beta invites', why: 'Beta tester list', due: null, since: daysAgo(2), tag: { name: 'Beta invites', hue: 'rose' } }],
  },
  {
    ...base,
    id: 'sample-sarah',
    name: 'Sarah Mbah',
    role: 'Partner',
    category: 'Family and home',
    email: 'sarah@example.com',
    preferredChannel: 'whatsapp',
    phone: '+237 600 000 002',
    avatarId: 'w4',
    lastSpoke: daysAgo(0),
    tag: { name: 'Savings', hue: 'teal' },
    projects: ['Savings', 'Home'],
    youWaitFor: [{ id: 'sar-1', title: 'Q4 savings figures', where: 'Savings', why: 'Q4 savings figures', due: inDays(2), since: daysAgo(1), tag: { name: 'Savings', hue: 'teal' } }],
  },
  {
    ...base,
    id: 'sample-fon',
    name: 'Dr Fon Ngwa',
    role: 'Dentist',
    category: 'Family and home',
    phone: '+237 600 000 003',
    email: '',
    preferredChannel: 'phone',
    avatarId: 'm5',
    lastSpoke: daysAgo(40),
    tag: { name: 'Health', hue: 'green' },
    projects: ['Health'],
  },
  {
    ...base,
    id: 'sample-kofi',
    name: 'Kofi Owusu',
    role: 'Developer',
    category: 'Clients and partners',
    email: 'kofi@example.com',
    preferredChannel: 'email',
    avatarId: 'm6',
    lastSpoke: daysAgo(34),
    tag: { name: 'Brightwave site', hue: 'orange' },
    projects: ['Brightwave site', 'Dreda'],
  },
  {
    ...base,
    id: 'sample-lena',
    name: 'Lena Brooks',
    role: 'Client',
    category: 'Clients and partners',
    email: 'lena@example.com',
    preferredChannel: 'email',
    avatarId: 'w5',
    lastSpoke: daysAgo(41),
    tag: { name: 'Freelance', hue: 'orange' },
    projects: ['Brightwave site'],
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
