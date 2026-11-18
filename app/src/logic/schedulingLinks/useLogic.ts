'use client';

// Scheduling (Dreda v1.0 `Scheduling` 60468, phone 70131, New link 70256):
// the links with on and off, their bookings (Confirm), and the New link
// form: name, length, one-off or repeating, hours per weekday with more
// than one range a day, gap, daily cap, where, and a note for the booker.
//
// Kept in this session for now (./store.ts): the booking-link and booking
// documents wait on the owner (BUILD-KIT section 7.6 and 7.7). When they
// exist, this hook is where they are read and saved; the screens do not
// change. Confirming does not email the booker yet (section 7.8).

import { useMemo, useState } from 'react';
import { showToast } from '@/src/widgets/Toast/Toast';
import { LABEL_HUES } from '@/src/viewmodels/projects';
import {
  bookedThisWeek,
  linkUrl,
  nextBooking,
  rangesClash,
  slugify,
  validRange,
  type Booking,
  type Cadence,
  type Place,
  type SchedLink,
  type TimeRange,
  type Weekday,
} from '@/src/viewmodels/scheduling-links';
import { schedulingStore, useScheduling } from './store';

export type LinkTab = 'all' | 'repeating' | 'one-off' | 'paused';

export interface LinkDraft {
  name: string;
  minutes: number;
  cadence: Cadence;
  hours: TimeRange[][];
  gapMinutes: number;
  perDay: number;
  place: Place;
  note: string;
}

export const LENGTHS = [15, 30, 45, 60];
export const GAPS = [0, 5, 10, 15, 30];
export const PER_DAY = [1, 2, 3, 4, 5, 6, 8];

const EMPTY: LinkDraft = {
  name: '',
  minutes: 30,
  cadence: 'repeating',
  hours: [[{ from: '10:00', to: '16:00' }], [{ from: '10:00', to: '16:00' }], [], [{ from: '10:00', to: '16:00' }], [{ from: '10:00', to: '16:00' }], [], []],
  gapMinutes: 15,
  perDay: 3,
  place: 'Video call',
  note: '',
};

const scheme = () => (typeof window !== 'undefined' ? window.location.protocol : 'https:');

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(`${scheme()}//${text}`);
    showToast('Link copied');
  } catch {
    showToast('Could not copy the link');
  }
}

export function useLogic() {
  const { links, bookings } = useScheduling();
  // Links point at this app's own booking page (/book/[slug]).
  const handle = typeof window !== 'undefined' ? window.location.host : 'dreda.app';
  const [tab, setTab] = useState<LinkTab>('all');
  const [draft, setDraft] = useState<LinkDraft>(EMPTY);
  const [now] = useState(() => new Date());

  const shown = links.filter((l) => (tab === 'all' ? true : tab === 'paused' ? !l.active : l.cadence === tab));
  const upcoming = useMemo(() => bookings.filter((b) => b.status !== 'declined' && b.at >= new Date(now.getTime() - 3600000)).sort((a, b) => a.at.getTime() - b.at.getTime()), [bookings, now]);
  const past = useMemo(() => bookings.filter((b) => b.at < now).sort((a, b) => b.at.getTime() - a.at.getTime()), [bookings, now]);
  const toConfirm = upcoming.filter((b) => b.status === 'requested').length;

  const update = <K extends keyof LinkDraft>(key: K, value: LinkDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setDay = (day: Weekday, ranges: TimeRange[]) => setDraft((d) => ({ ...d, hours: d.hours.map((r, i) => (i === day ? ranges : r)) }));
  const addRange = (day: Weekday) =>
    setDraft((d) => {
      const last = d.hours[day][d.hours[day].length - 1];
      const from = last ? last.to : '09:00';
      const h = Math.min(23, Number(from.slice(0, 2)) + 2);
      return { ...d, hours: d.hours.map((r, i) => (i === day ? [...r, { from, to: `${String(h).padStart(2, '0')}:${from.slice(3)}` }] : r)) };
    });
  const setRange = (day: Weekday, index: number, range: TimeRange) => setDay(day, draft.hours[day].map((r, i) => (i === index ? range : r)));
  const removeRange = (day: Weekday, index: number) => setDay(day, draft.hours[day].filter((_, i) => i !== index));

  const slug = slugify(draft.name);
  const previewUrl = linkUrl(handle, slug);
  const problem = !draft.name.trim()
    ? 'Give the link a name.'
    : draft.hours.every((r) => r.length === 0)
      ? 'Open at least one day.'
      : draft.hours.some((r) => r.some((x) => !validRange(x)))
        ? 'Each range has to end after it starts.'
        : draft.hours.some(rangesClash)
          ? 'Two ranges on one day overlap.'
          : links.some((l) => l.slug === slug)
            ? 'A link with this name already exists.'
            : null;

  /** Saves the draft as a link; returns it, or null when it is not ready. */
  function create(): SchedLink | null {
    if (problem) {
      showToast(problem);
      return null;
    }
    const link: SchedLink = {
      id: `local-${Date.now().toString(36)}`,
      name: draft.name.trim(),
      slug,
      minutes: draft.minutes,
      place: draft.place,
      cadence: draft.cadence,
      active: true,
      hours: draft.hours,
      gapMinutes: draft.gapMinutes,
      perDay: draft.perDay,
      note: draft.note.trim(),
      until: draft.cadence === 'one-off' ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59) : null,
      pausedNote: '',
      hue: LABEL_HUES[links.length % 8],
    };
    schedulingStore.addLink(link);
    setDraft(EMPTY);
    void copyText(linkUrl(handle, link.slug));
    return link;
  }

  return {
    handle,
    now,
    links,
    shown,
    tab,
    setTab,
    bookings,
    upcoming,
    past,
    toConfirm,
    bookedThisWeek: (linkId: string | null) => bookedThisWeek(bookings, linkId, now),
    nextBooking: (linkId: string) => nextBooking(bookings, linkId, now),
    linkOf: (b: Booking) => links.find((l) => l.id === b.linkId) ?? null,
    url: (l: SchedLink) => linkUrl(handle, l.slug),
    copy: (l: SchedLink) => copyText(linkUrl(handle, l.slug)),
    send: (l: SchedLink) => window.open(`mailto:?subject=${encodeURIComponent(`Book a time: ${l.name}`)}&body=${encodeURIComponent(`Pick a time that suits you: ${scheme()}//${linkUrl(handle, l.slug)}`)}`, '_blank', 'noopener'),
    setActive: (l: SchedLink, active: boolean) => schedulingStore.updateLink(l.id, { active, pausedNote: active ? '' : l.pausedNote }),
    confirm: (b: Booking) => {
      schedulingStore.setBooking(b.id, 'confirmed');
      showToast(`Confirmed ${b.name}`);
    },
    decline: (b: Booking) => schedulingStore.setBooking(b.id, 'declined'),
    draft,
    update,
    addRange,
    setRange,
    removeRange,
    clearDay: (day: Weekday) => setDay(day, []),
    openDay: (day: Weekday) => setDay(day, [{ from: '09:00', to: '17:00' }]),
    previewUrl,
    problem,
    create,
    copyPreview: () => copyText(previewUrl),
    reset: () => setDraft(EMPTY),
  };
}

export type SchedulingLogic = ReturnType<typeof useLogic>;
