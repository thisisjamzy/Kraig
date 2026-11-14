// People (Design-System HANDOFF section 21): a private list of the people
// work waits on. A person is a record, not an account: no invitation, no
// seat, no assignment. Each has a name, a category, a priority flag, contact
// details and notes; avatars are local Notionist assets keyed by avatarId.
//
// UI only for now: there is no `people` collection yet (it needs a rules
// change), so src/logic/people keeps these records in memory.

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
}

export const AVATAR_IDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'] as const;
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
