'use client';

// Scheduling links (Design-System HANDOFF section 21, `Calendar / Web /
// Scheduling links`): send a link, they pick a slot, it lands in a calendar.
//
// UI only for now. Nothing here reads or writes Firestore: the two links are
// sample rows and the form is a local draft. When the booking-link model
// exists, this hook is where it is read and saved; the screen does not change.

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { showToast } from '@/src/widgets/Toast/Toast';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Monday first

export interface SchedulingLink {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  /** Availability in words. */
  availability: string;
  usage: string | null;
}

export interface LinkDraft {
  name: string;
  duration: string;
  buffer: string;
  days: Weekday[];
  from: string;
  to: string;
  calendar: string;
  attachTo: string;
  confirmation: string;
}

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const DURATIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
];

export const BUFFERS = [
  { value: '0', label: 'No buffer' },
  { value: '5', label: '5 minute buffer' },
  { value: '10', label: '10 minute buffer' },
  { value: '15', label: '15 minute buffer' },
  { value: '30', label: '30 minute buffer' },
];

export const HOURS = Array.from({ length: 16 }, (_, i) => {
  const h = String(i + 7).padStart(2, '0');
  return { value: `${h}:00`, label: `${h}:00` };
});

export const CALENDARS = [
  { value: 'work', label: 'Lands in the Work calendar' },
  { value: 'personal', label: 'Lands in the Personal calendar' },
];

export const ATTACH_TO = [{ value: '', label: 'Attach bookings to no project' }];

const SAMPLE_LINKS: SchedulingLink[] = [
  {
    id: 'quick-call',
    name: 'Quick call, 30 minutes',
    slug: 'quick-call',
    active: true,
    availability: 'Weekdays 14:00 to 17:00 · 15 minute buffer · at most 3 a day · lands in Work calendar',
    usage: 'Used 7 times · 2 booked this week · last on 12 Nov',
  },
  {
    id: 'site-visit',
    name: 'Site visit, 2 hours',
    slug: 'site-visit',
    active: false,
    availability: 'Saturdays only · lands in Work calendar',
    usage: null,
  },
];

const EMPTY_DRAFT: LinkDraft = {
  name: '',
  duration: '30',
  buffer: '15',
  days: [0, 1, 2, 3, 4],
  from: '14:00',
  to: '17:00',
  calendar: 'work',
  attachTo: '',
  confirmation: '',
};

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function linkUrl(handle: string, slug: string) {
  return `dreda.app/${handle}/${slug || 'your-link'}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(`https://${text}`);
    showToast('Link copied');
  } catch {
    showToast('Could not copy the link');
  }
}

export function useLogic() {
  const { user } = useFirebaseUser();
  const handle = useMemo(() => slugify((user?.displayName || user?.email?.split('@')[0] || 'you').split(' ')[0]) || 'you', [user]);
  const [links, setLinks] = useState<SchedulingLink[]>(SAMPLE_LINKS);
  const [draft, setDraft] = useState<LinkDraft>(EMPTY_DRAFT);

  const update = <K extends keyof LinkDraft>(key: K, value: LinkDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleDay = (day: Weekday) =>
    setDraft((d) => ({ ...d, days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort() as Weekday[] }));
  const setActive = (id: string, active: boolean) => setLinks((all) => all.map((l) => (l.id === id ? { ...l, active } : l)));

  const previewUrl = linkUrl(handle, slugify(draft.name));
  const canCreate = draft.name.trim().length > 0 && draft.days.length > 0 && draft.from < draft.to;

  return {
    handle,
    links,
    draft,
    previewUrl,
    canCreate,
    update,
    toggleDay,
    setActive,
    copy: (link: SchedulingLink) => copyText(linkUrl(handle, link.slug)),
    reset: () => setDraft(EMPTY_DRAFT),
    // Saving is not connected yet: the button copies the preview so the
    // flow can be tried end to end.
    createAndCopy: () => {
      if (!canCreate) return;
      void copyText(previewUrl);
    },
  };
}
