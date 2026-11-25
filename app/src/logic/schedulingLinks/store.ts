'use client';

// Scheduling links and their bookings, held in memory for now: the
// booking-link and booking documents wait on the owner (BUILD-KIT section
// 7.6 and 7.7). Shared by the Scheduling page and New link within a
// session; gone on reload. The samples are the ones the v1.0 frames are
// drawn with.

import { useSyncExternalStore } from 'react';
import type { Booking, SchedLink, TimeRange } from '@/src/viewmodels/scheduling-links';

const r = (from: string, to: string): TimeRange => ({ from, to });
const at = (days: number, h: number, m = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, h, m);
};
const weekdays = (range: TimeRange[]) => [range, range, range, range, range, [], []];

interface State {
  links: SchedLink[];
  bookings: Booking[];
}

let state: State = {
  links: [
    { id: 'intro-call', name: 'Intro call', slug: 'intro-call', minutes: 30, place: 'Video call', cadence: 'repeating', active: true, hours: weekdays([r('10:00', '16:00')]), gapMinutes: 15, perDay: 3, note: 'Tell me a little about the project so I can come prepared.', until: null, pausedNote: '', hue: 'purple' },
    { id: 'brightwave-review', name: 'Brightwave review', slug: 'brightwave-review', minutes: 45, place: 'Video call', cadence: 'one-off', active: true, hours: weekdays([r('09:00', '17:00')]), gapMinutes: 15, perDay: 1, note: '', until: at(3, 23, 59), pausedNote: '', hue: 'amber' },
    { id: 'mentoring', name: 'Mentoring', slug: 'mentoring', minutes: 60, place: 'In person', cadence: 'repeating', active: false, hours: [[r('17:00', '19:00')], [], [], [], [], [], []], gapMinutes: 0, perDay: 1, note: '', until: null, pausedNote: 'Paused for December, resumes 5 Jan', hue: 'teal' },
  ],
  bookings: [
    { id: 'b1', linkId: 'intro-call', name: 'Ama Mensah', email: 'ama@example.com', note: '', at: at(1, 11), status: 'confirmed' },
    { id: 'b2', linkId: 'brightwave-review', name: 'Tom Reid', email: 'tom@example.com', note: '', at: at(0, 15), status: 'confirmed' },
    { id: 'b3', linkId: 'intro-call', name: 'Kofi Owusu', email: 'kofi@example.com', note: 'Keen to talk about the booking API.', at: at(2, 10, 30), status: 'requested' },
    { id: 'b4', linkId: 'intro-call', name: 'Lena Brooks', email: 'lena@example.com', note: '', at: at(5, 14), status: 'requested' },
  ],
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const schedulingStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  addLink(link: SchedLink) {
    state = { ...state, links: [link, ...state.links] };
    emit();
  },
  updateLink(id: string, patch: Partial<SchedLink>) {
    state = { ...state, links: state.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
    emit();
  },
  /** Deletes a link; its bookings go too, or stay with no link. */
  removeLink(id: string, withBookings: boolean) {
    state = { links: state.links.filter((l) => l.id !== id), bookings: withBookings ? state.bookings.filter((b) => b.linkId !== id) : state.bookings };
    emit();
  },
  removeBooking(id: string) {
    state = { ...state, bookings: state.bookings.filter((b) => b.id !== id) };
    emit();
  },
  addBooking(booking: Booking) {
    state = { ...state, bookings: [...state.bookings, booking] };
    emit();
  },
  setBooking(id: string, status: Booking['status']) {
    state = { ...state, bookings: state.bookings.map((b) => (b.id === id ? { ...b, status } : b)) };
    emit();
  },
};

export function useScheduling() {
  return useSyncExternalStore(schedulingStore.subscribe, schedulingStore.get, schedulingStore.get);
}
