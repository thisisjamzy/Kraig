// People (Design-System HANDOFF section 21): a private list of the people
// work waits on. A person is a record, not an account: no invitation, no
// seat, no assignment. Each has a name, a category, a priority flag, contact
// details and notes; avatars are local Notionist assets keyed by avatarId.
//
// UI only for now: there is no `people` collection yet (it needs a rules
// change), so src/logic/people keeps these records in memory.

import type { LabelHue } from './projects';

export type PersonPriority = 'high' | 'normal' | 'low';
export type Channel = 'email' | 'phone' | 'whatsapp' | 'in person';
export type PeopleFilter = 'everyone' | 'high' | 'waitingOnYou' | 'youWait' | 'quiet';
export type PeopleSort = 'category' | 'priority' | 'az';

export interface WaitItem {
  id: string;
  title: string;
  where: string;
  why: string;
  due: Date | null;
  /** The project or area it belongs to, as a tag (Dreda v1.0 People). */
  tag?: { name: string; hue: LabelHue } | null;
  /** When it started waiting. */
  since?: Date | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  category: string;
  priority: PersonPriority;
  email: string;
  phone: string;
  place: string;
  preferredChannel: Channel;
  notes: string;
  avatarId: string;
  archived: boolean;
  lastSpoke: Date | null;
  /** Things this person is waiting on you for. */
  waitingOnYou: WaitItem[];
  /** Things you are waiting on them for. */
  youWaitFor: WaitItem[];
  history: { date: Date; text: string }[];
  /** The project or area they are mostly about, as a tag. */
  tag?: { name: string; hue: LabelHue } | null;
  /** Projects (by name) they work on with you: their face shows on those
   * project cards. */
  projects?: string[];
}

export const AVATAR_IDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'] as const;
// The account has no face of its own yet: the design's default Notionist
// (Dreda v1.0 Avatar/Person, Man 1), on the drawer and on Profile.
export const PROFILE_AVATAR_ID = 'm1';
export const avatarSrc = (id: string) => `/avatars/notionist-${AVATAR_IDS.includes(id as (typeof AVATAR_IDS)[number]) ? id : 'w1'}.svg`;

export const DEFAULT_CATEGORIES = ['Clients and partners', 'Family and home', 'Money and admin'];
export const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'in person', label: 'In person' },
];

export const PRIORITY_LABEL: Record<PersonPriority, string> = { high: 'High priority', normal: 'Normal', low: 'Low' };
const PRIORITY_RANK: Record<PersonPriority, number> = { high: 0, normal: 1, low: 2 };

const QUIET_DAYS = 30;

export function isQuiet(p: Person, now: Date) {
  return !p.waitingOnYou.length && !p.youWaitFor.length && (!p.lastSpoke || now.getTime() - p.lastSpoke.getTime() > QUIET_DAYS * 86_400_000);
}

export function filterPeople(people: Person[], filter: PeopleFilter, now: Date) {
  const live = people.filter((p) => !p.archived);
  switch (filter) {
    case 'high':
      return live.filter((p) => p.priority === 'high');
    case 'waitingOnYou':
      return live.filter((p) => p.waitingOnYou.length > 0);
    case 'youWait':
      return live.filter((p) => p.youWaitFor.length > 0);
    case 'quiet':
      return live.filter((p) => isQuiet(p, now));
    default:
      return live;
  }
}

export function groupPeople(people: Person[], sort: PeopleSort): { label: string; people: Person[] }[] {
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  if (sort === 'az') return people.length ? [{ label: 'A to Z', people: [...people].sort(byName) }] : [];
  const key = (p: Person) => (sort === 'category' ? p.category : PRIORITY_LABEL[p.priority]);
  const groups = new Map<string, Person[]>();
  for (const p of people) groups.set(key(p), [...(groups.get(key(p)) ?? []), p]);
  const order = sort === 'category' ? [...groups.keys()] : (['high', 'normal', 'low'] as PersonPriority[]).map((x) => PRIORITY_LABEL[x]).filter((l) => groups.has(l));
  return order.map((label) => ({
    label,
    people: groups.get(label)!.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byName(a, b)),
  }));
}

export function lastSpokeWords(d: Date | null, now: Date) {
  if (!d) return 'not spoken yet';
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'last spoke today';
  if (days === 1) return 'last spoke yesterday';
  if (days > QUIET_DAYS) return `quiet since ${d.toLocaleDateString('en-GB', { month: 'long' })}`;
  return `last spoke ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export function firstName(name: string) {
  return name.split(/[\s,]+/)[0] || name;
}

// ---- Time v1.0 People (Dreda v1.0 `People` 56563, phone 69981) ----

export interface WaitRow {
  person: Person;
  item: WaitItem;
  /** Days past its due date (0 when not late). */
  late: number;
  /** Days it has been waiting. */
  waiting: number;
}

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Everything people wait on you for, most late first. */
export function waitingOnYouRows(people: Person[], now: Date): WaitRow[] {
  return people
    .filter((p) => !p.archived)
    .flatMap((person) => person.waitingOnYou.map((item) => ({ person, item, late: item.due ? Math.max(0, days(item.due, now)) : 0, waiting: item.since ? days(item.since, now) : 0 })))
    .sort((a, b) => b.late - a.late || b.waiting - a.waiting);
}

/** Everything you wait on people for, longest waiting first. */
export function youWaitRows(people: Person[], now: Date): WaitRow[] {
  return people
    .filter((p) => !p.archived)
    .flatMap((person) => person.youWaitFor.map((item) => ({ person, item, late: item.due ? Math.max(0, days(item.due, now)) : 0, waiting: item.since ? days(item.since, now) : 0 })))
    .sort((a, b) => b.waiting - a.waiting || (a.item.due?.getTime() ?? Infinity) - (b.item.due?.getTime() ?? Infinity));
}

/** Nothing open either way and quiet for over 30 days. */
export function goingCold(people: Person[], now: Date): Person[] {
  return people.filter((p) => !p.archived && isQuiet(p, now)).sort((a, b) => (a.lastSpoke?.getTime() ?? 0) - (b.lastSpoke?.getTime() ?? 0));
}

export function quietDays(p: Person, now: Date): number | null {
  return p.lastSpoke ? days(p.lastSpoke, now) : null;
}

/** "last in touch today", "yesterday", "Monday", "3 days ago", "in October". */
export function lastTouchWords(d: Date | null, now: Date): string {
  if (!d) return 'not in touch yet';
  const n = days(d, now);
  if (n <= 0) return 'last in touch today';
  if (n === 1) return 'last in touch yesterday';
  if (n < 7 && d.getDay() < now.getDay()) return `last in touch ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`;
  if (n <= 30) return `last in touch ${n} days ago`;
  return `last in touch in ${d.toLocaleDateString('en-GB', { month: 'long' })}`;
}

/** "3 days late", "1 day late". */
export function lateWords(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'} late`;
}

/** "AB" */
export function initialsOf(name: string): string {
  const words = name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Where a message to them opens: their preferred channel, else email. */
export function contactHref(p: Person, subject: string): string | null {
  const digits = p.phone.replace(/[^0-9+]/g, '');
  if (p.preferredChannel === 'whatsapp' && digits) return `https://wa.me/${digits.replace('+', '')}?text=${encodeURIComponent(subject)}`;
  if (p.preferredChannel === 'phone' && digits) return `tel:${digits}`;
  if (p.email) return `mailto:${p.email}?subject=${encodeURIComponent(subject)}`;
  if (digits) return `tel:${digits}`;
  return null;
}

/** People on a project card: those you work with on it (by project name). */
export function peopleOn(people: Person[], projectName: string): Person[] {
  const name = projectName.trim().toLowerCase();
  return people.filter((p) => !p.archived && (p.projects ?? []).some((x) => x.trim().toLowerCase() === name));
}
